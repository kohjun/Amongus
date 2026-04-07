-- server/ai/rag/migration.sql
--
-- Supabase pgvector RAG 마이그레이션
-- ragRetriever.js의 match_game_rules RPC 호출 구조에 맞춰 작성됨
--
-- 실행 전 pgvector 확장 설치 필요:
--   CREATE EXTENSION IF NOT EXISTS vector;

-- ════════════════════════════════════════════════════════
--  1. game_rules 테이블
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS game_rules (
  chunk_id   TEXT        PRIMARY KEY,          -- 청크 고유 ID
  parent_id  TEXT        REFERENCES game_rules(chunk_id) ON DELETE CASCADE,
  game_type  TEXT        NOT NULL,             -- 'among_us' | 'mafia' | ...
  role       TEXT        NOT NULL DEFAULT 'all', -- 'crew' | 'impostor' | 'all'
  phase      TEXT        NOT NULL DEFAULT 'all', -- 'playing' | 'meeting' | 'all'
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  is_parent  BOOLEAN     NOT NULL DEFAULT FALSE,
  embedding  vector(768),                     -- text-embedding-3-small 출력 차원
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 벡터 유사도 검색용 HNSW 인덱스 (코사인 거리)
CREATE INDEX IF NOT EXISTS game_rules_embedding_idx
  ON game_rules
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 게임 타입·역할·페이즈 필터 인덱스
CREATE INDEX IF NOT EXISTS game_rules_filter_idx
  ON game_rules (game_type, role, phase, is_parent);

-- ════════════════════════════════════════════════════════
--  2. match_game_rules RPC 함수
--
--  호출 파라미터 (ragRetriever.js searchChildren 기준):
--    query_embedding : vector(768)
--    match_threshold : float8   (MIN_SIMILARITY = 0.65)
--    match_count     : int      (TOP_K = 5)
--    p_game_type     : text
--    p_role          : text     ('crew' | 'impostor')
--    p_phase         : text     (room.status)
--
--  반환: chunk_id, parent_id, title, content, similarity
-- ════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION match_game_rules(
  query_embedding vector(768),
  match_threshold float8,
  match_count     int,
  p_game_type     text,
  p_role          text,
  p_phase         text
)
RETURNS TABLE (
  chunk_id   text,
  parent_id  text,
  title      text,
  content    text,
  similarity float8
)
LANGUAGE sql STABLE
AS $$
  SELECT
    gr.chunk_id,
    gr.parent_id,
    gr.title,
    gr.content,
    1 - (gr.embedding <=> query_embedding) AS similarity
  FROM game_rules gr
  WHERE
    gr.is_parent = FALSE
    AND gr.embedding IS NOT NULL
    AND gr.game_type = p_game_type
    -- role: 'all' 청크는 모든 역할에 포함, 그 외 정확 일치
    AND (gr.role = 'all' OR gr.role = p_role)
    -- phase: 'all' 청크는 모든 페이즈에 포함, 그 외 정확 일치
    AND (gr.phase = 'all' OR gr.phase = p_phase)
    AND 1 - (gr.embedding <=> query_embedding) >= match_threshold
  ORDER BY gr.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ════════════════════════════════════════════════════════
--  3. Row Level Security (선택적 — Supabase 서비스 키로만 접근)
-- ════════════════════════════════════════════════════════

ALTER TABLE game_rules ENABLE ROW LEVEL SECURITY;

-- 서비스 키(service_role)는 RLS 우회, anon 키는 읽기 전용
CREATE POLICY "anon_read" ON game_rules
  FOR SELECT TO anon USING (TRUE);
