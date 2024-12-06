// netlify/functions/huggingface.js
const fetch = require("node-fetch");

exports.handler = async function (event, context) {
  const hfToken = process.env.REACT_APP_HF_TOKEN; // Access the secret Hugging Face token

  if (!hfToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Hugging Face token is not set" }),
    };
  }

  const { prompt, model = "tgi", max_tokens = 150 } = JSON.parse(event.body);

  const url =
    "https://jzyutjh6xvrcylwx.us-east-1.aws.endpoints.huggingface.cloud/v1/chat/completions";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: max_tokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    return {
      statusCode: response.status,
      body: JSON.stringify({ error: "Failed to contact Hugging Face API" }),
    };
  }

  const data = await response.json();
  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
};
