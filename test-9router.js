const apiKey = "sk-9926acdab993c93d-vy7idk-2212e114";
const fetch = require('node-fetch') || globalThis.fetch;

async function test() {
  const res = await fetch("https://9router.zool.asia/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "kr/glm-4",
      temperature: 0.1,
      messages: [{ role: "user", content: "hello" }],
    }),
  });
  console.log(res.status, await res.text());
}
test();
