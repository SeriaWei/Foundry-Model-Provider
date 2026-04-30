做一个vs code的插件，这个插件的功能是实现一个vs code的chat model provider，LLM的来源是Microsoft Foundry。要能配置endpoint,apiKey,deployment name（model id，支持多模型切换，还可以动态调整参数，thinking配置，是否支持图片，等等），支持streaming response。


以下是一个使用Microsoft Foundry API的示例代码：
API example code
```
import OpenAI from "openai";

const endpoint = "https://detect-language.services.ai.azure.com/openai/v1";
const deploymentName = "gpt-4.1";
const apiKey = "<your-api-key>";

const openai = new OpenAI({
    baseURL: endpoint,
    apiKey: apiKey
});

async function main() {
  const runner = openai.responses
    .stream({
      model: deploymentName,
      input: 'solve 8x + 31 = 2',
    })
    .on('event', (event) => console.log(event))
    .on('response.output_text.delta', (diff) => process.stdout.write(diff.delta));

  for await (const event of runner) {
    console.log('event', event);
  }

  const result = await runner.finalResponse();
  console.log(result);
}

main();
```
