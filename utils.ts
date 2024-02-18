import { Contact, Message, ScanStatus, log, Friendship } from "wechaty";
import { bot, openai, initState } from "./bot";
import markdownIt from "markdown-it";
import qrTerm from "qrcode-terminal";
import request from "request";

const MEMORY_LIMIT = 50; // max memory
let conversation: Array<any> = new Array();
conversation.forEach((val) => initState.push(Object.assign({}, val)));
let token: any = null;
let showContent = 0;
const dictServer = [
  { label: "1. **青铜服务**：19.9元\n", value: ["1", "青铜", "19.9"] },
  { label: "2. **白银服务**：29.9元\n", value: ["2", "白银", "29.9"] },
  { label: "3. **黄金服务**：39.9元\n", value: ["3", "黄金", "39.9"] },
  { label: "4. **钻石服务**：49.9元\n", value: ["4", "钻石", "49.9"] },
  { label: "5. **星耀服务**：59.9元\n", value: ["5", "星耀", "59.9"] },
  { label: "6. **王者服务**：99.9元\n", value: ["6", "王者", "99.9"] },
];
const startContent =
  "你好，请告诉我你想要的服务\n" +
  "\n" +
  dictServer[0].label +
  dictServer[1].label +
  dictServer[2].label +
  dictServer[3].label +
  dictServer[4].label +
  dictServer[5].label +
  "\n" +
  "亲 请选择你想要的服务吧。";

export function onScan(qrcode: string, status: ScanStatus) {
  if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
    qrTerm.generate(qrcode, { small: true }); // show qrcode on console
    const qrcodeImageUrl = [
      "https://wechaty.js.org/qrcode/",
      encodeURIComponent(qrcode),
    ].join("");

    log.info(
      "StarterBot",
      "onScan: %s(%s) - %s",
      ScanStatus[status],
      status,
      qrcodeImageUrl
    );
  } else {
    log.info("StarterBot", "onScan: %s(%s)", ScanStatus[status], status);
  }
}

export function onLogin(user: Contact) {
  log.info("StarterBot", "%s login", user);
}

export function onLogout(user: Contact) {
  log.info("StarterBot", "%s logout", user);
}
export async function onMessage(msg: Message) {
  log.info("StarterBot", msg.toString());
  const contact = msg.talker();
  const content = msg.text();
  const isText = msg.type() === bot.Message.Type.Text;
  if (msg.self() || !isText) {
    // msg.self() check if the message is sent from the bot itself
    return;
  }
  if (!showContent) {
    showContent = 1;
    await contact.say(startContent);
    return;
  }
  let replyContent = "";
  for (let index = 0; index < dictServer.length; index++) {
    const ele = dictServer[index];
    if (ele.value.some((e) => content.includes(e))) {
      replyContent = ele.label;
      break;
    }
  }
  try {
    await contact.say(replyContent);
    console.log("replyContent", replyContent);
  } catch (e) {
    console.error(e);
  }
}

export async function onWenXinMessage(msg: Message) {
  log.info("StarterBot", msg.toString());

  const contact = msg.talker();
  const content = msg.text();
  const isText = msg.type() === bot.Message.Type.Text;
  if (msg.self() || !isText) {
    // msg.self() check if the message is sent from the bot itself
    return;
  }
  if (content === "ding") {
    await contact.say("dong");
  }
  // return text if no slash command is specified
  if (conversation.length === MEMORY_LIMIT) {
    // reset to initial state when reach the memory limit
    log.info("Resetting memory");
    conversation = new Array();
    conversation.forEach((val) => initState.push(Object.assign({}, val)));
  }
  conversation.push({ role: "user", content: content.replace("/t", "") });
  console.log("conversation", conversation);
  const response = await getMessage(conversation);

  try {
    const replyContent = response;
    await contact.say(replyContent);

    // record reply
    const reply = {
      role: "assistant",
      content: replyContent,
    };
    console.log("reply", reply);
    conversation.push(reply);
  } catch (e) {
    console.error(e);
  }
}

export async function onFriendship(friendship: Friendship) {
  let logMsg;

  try {
    logMsg = "received `friend` event from " + friendship.contact().name();
    log.info(logMsg);

    switch (friendship.type()) {
      /**
       *
       * 1. New Friend Request
       *
       * when request is set, we can get verify message from `request.hello`,
       * and accept this request by `request.accept()`
       */

      case bot.Friendship.Type.Receive:
        logMsg = "accepted automatically";
        log.info("before accept");
        await friendship.accept();

        // if want to send msg , you need to delay sometimes
        await new Promise((r) => setTimeout(r, 1000));
        await friendship
          .contact()
          .say(
            `Hi ${friendship
              .contact()
              .name()} from FreeChatGPT, I am your person asistant!\n你好 ${friendship
              .contact()
              .name()} 我是你的私人助理FreeChatGPT!`
          );
        console.log("after accept");
        break;

      /**
       *
       * 2. Friend Ship Confirmed
       *
       */
      case bot.Friendship.Type.Confirm:
        logMsg = "friendship confirmed with " + friendship.contact().name();
        break;

      default:
        break;
    }
  } catch (e) {
    console.error(e);
    logMsg = "Friendship try catch failed";
  }

  log.info(logMsg);
}

// [
//   {
//           "role": "user",
//           "content": "你好"
//   },
//   {
//           "role": "assistant",
//           "content": "你好，有什么我可以帮你的吗？"
//   }
// ]

async function getMessage(messages: any[]) {
  const options = {
    method: "POST",
    url:
      "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions?access_token=" +
      (await getAccessToken()),
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: messages,
      disable_search: false,
      enable_citation: false,
    }),
  };

  try {
    const { result }: any = await requestPromise(options);
    return result;
  } catch (error) {
    token = null;
    return null;
  }
}

function requestPromise(options: any) {
  return new Promise((resolve, reject) => {
    request(options, (error: any, response: any) => {
      if (error) {
        reject(error);
      } else {
        resolve(JSON.parse(response.body));
      }
    });
  });
}

/**
 * 使用 AK，SK 生成鉴权签名（Access Token）
 * @return string 鉴权签名信息（Access Token）
 */
export async function getAccessToken() {
  const AK = "mvpO5ftbbxi7m0R05tpU0xdB";
  const SK = "88p67xu3bEDyXjnrYSCG0GHtoC2nBxE1";
  if (token) return token;
  let options = {
    method: "POST",
    url:
      "https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=" +
      AK +
      "&client_secret=" +
      SK,
  };
  try {
    const { access_token }: any = await requestPromise(options);
    token = access_token;
    return access_token;
  } catch (error) {
    token = null;
    return null;
  }
}
