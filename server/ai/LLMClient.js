// server/ai/LLMClient.js

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 모델 선택 (fast = 공개 해설용, precise = 개인 가이드용)
const MODELS = {
  fast:    'gemini-2.5-flash',  // 공개 해설용 (빠름)
  precise: 'gemini-2.5-flash',  // 개인 가이드용 (정확)
};

async function chat({ prompt, systemPrompt, model = 'fast', maxTokens = 150 }) {
  try {
    const genModel = genAI.getGenerativeModel({
      model:             MODELS[model],
      systemInstruction: systemPrompt,
    });

    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature:     0.8,  // 약간의 창의성
      },
    });

    return result.response.text().trim();

  } catch (err) {
    console.error('[LLM] API 오류:', err.message);
    // API 실패 시 fallback 메시지
    return getFallbackMessage(prompt);
  }
}

// API 장애 시 fallback
function getFallbackMessage(prompt) {
  if (prompt.includes('킬'))   return '🔴 이상한 낌새가 느껴집니다...';
  if (prompt.includes('회의')) return '🚨 긴급 회의가 소집됩니다!';
  if (prompt.includes('추방')) return '⚖️ 투표 결과가 나왔습니다.';
  if (prompt.includes('미션')) return '📋 미션을 계속 진행하세요.';
  return '👁️ 모든 것을 지켜보고 있습니다...';
}

module.exports = { chat };
