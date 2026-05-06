/**
 * 快速测试 Microsoft Foundry API 连通性
 * 运行: node test-api.mjs
 * 
 * 使用前请修改下面的 endpoint 和 apiKey
 */

import OpenAI from "openai";

const endpoint = "https://detect-language.services.ai.azure.com/openai/v1";
const deploymentName = "gpt-5.4-mini";
const apiKey = process.env.FOUNDRY_API_KEY || "<your-api-key>";

if (apiKey === "<your-api-key>") {
    console.error("请先设置 FOUNDRY_API_KEY 环境变量，或直接在脚本中填入 apiKey");
    console.error("示例: $env:FOUNDRY_API_KEY='your-key'; node test-api.mjs");
    process.exit(1);
}

const openai = new OpenAI({
    baseURL: endpoint,
    apiKey: apiKey
});

async function testResponsesAPI() {
    console.log("=== 测试 Responses API (官方示例) ===");
    console.log(`Endpoint: ${endpoint}`);
    console.log(`Model: ${deploymentName}`);
    console.log("");

    try {
        const runner = openai.responses
            .stream({
                model: deploymentName,
                input: 'solve 8x + 31 = 2',
            })
            .on('response.start', (response) => {
                console.log("Response started:", response);
            })
            .on('response.reasoning_summary_text.delta', (diff) => process.stdout.write(diff.delta))
            .on('response.output_text.delta', (diff) => process.stdout.write(diff.delta));

        for await (const event of runner) {
            // streaming events
        }

        const result = await runner.finalResponse();
        console.log("\n\n=== Final Response ===");
        console.log(JSON.stringify(result, null, 2));
        console.log("\n✅ Responses API 测试成功!");
    } catch (err) {
        console.error("\n❌ Responses API 测试失败:", err.message);
        if (err.status) console.error("   HTTP Status:", err.status);
        if (err.error) console.error("   Error Detail:", JSON.stringify(err.error, null, 2));
    }
}

async function testChatCompletionsAPI() {
    console.log("\n=== 测试 Chat Completions API ===");
    try {
        const stream = await openai.chat.completions.create({
            model: deploymentName,
            messages: [{ role: "user", content: "solve 8x + 31 = 2" }],
            stream: true,
        });

        process.stdout.write("Response: ");
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || '';
            process.stdout.write(delta);
        }
        console.log("\n\n✅ Chat Completions API 测试成功!");
    } catch (err) {
        console.error("\n❌ Chat Completions API 测试失败:", err.message);
        if (err.status) console.error("   HTTP Status:", err.status);
        if (err.error) console.error("   Error Detail:", JSON.stringify(err.error, null, 2));
    }
}

await testResponsesAPI();
await testChatCompletionsAPI();
