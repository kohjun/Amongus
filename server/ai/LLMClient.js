// src/ai/LLMClient.js

const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 모델 선택
const MODELS = {
  fast:    'gpt-4o-mini',  // 공개 해설용 (빠름, 저렴)
  precise: 'gpt-4o',       // 개인 가이드용 (정확)
};

async function chat({ prompt, systemPrompt, model = 'fast', maxTokens = 150 }) {
  try {
    const response = await client.chat.completions.create({
      model:       MODELS[model],
      max_tokens:  maxTokens,
      temperature: 0.8,  // 약간의 창의성
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: prompt },
      ],
    });

    return response.choices[0].message.content.trim();

  } catch (err) {
    console.error('[LLM] API 오류:', err.message);
    // API 실패 시 fallback 메시지
    return getFallbackMessage(prompt);
  }
}

// API 장애 시 fallback
function getFallbackMessage(prompt) {
  if (prompt.includes('킬'))      return '🔴 이상한 낌새가 느껴집니다...';
  if (prompt.includes('회의'))    return '🚨 긴급 회의가 소집됩니다!';
  if (prompt.includes('추방'))    return '⚖️ 투표 결과가 나왔습니다.';
  if (prompt.includes('미션'))    return '📋 미션을 계속 진행하세요.';
  return '👁️ 모든 것을 지켜보고 있습니다...';
}

module.exports = { chat };