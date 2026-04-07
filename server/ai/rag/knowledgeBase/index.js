// server/ai/rag/knowledgeBase/index.js
//
// 전체 게임 지식 베이스 진입점
// 새 게임 추가 시 여기에 import만 추가하면 됩니다.

'use strict';

const amongUsChunks = [
  ...require('./among_us/common'),
  ...require('./among_us/crew'),
  ...require('./among_us/impostor'),
  ...require('./among_us/items'),
  ...require('./among_us/faq'),
];

// 추후 추가 예시:
// const mafiaChunks = [...require('./mafia/common'), ...]

const ALL_CHUNKS = [
  ...amongUsChunks,
  // ...mafiaChunks,
];

// 임베딩할 텍스트 생성 (자식 청크만)
function getEmbeddableChunks() {
  return ALL_CHUNKS
    .filter(c => !c.isParent)
    .map(c => ({
      ...c,
      embedText: `[${c.title}]\n${c.content}`,
    }));
}

// 게임 타입별 청크 조회
function getChunksByGame(gameType) {
  return ALL_CHUNKS.filter(c => c.gameType === gameType);
}

// chunk_id로 부모 문서 조회 (로컬 fallback용)
function getParentChunk(parentId) {
  return ALL_CHUNKS.find(c => c.chunkId === parentId && c.isParent) || null;
}

module.exports = { ALL_CHUNKS, getEmbeddableChunks, getChunksByGame, getParentChunk };