-- GMC Platform — Phase 2: Advanced RAG, OCR metadata

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS knowledge_documents_metadata_idx
  ON knowledge_documents USING gin (metadata);

-- Improve match_chunks: filter out chunks with very low similarity at query time
-- (threshold applied in application layer; RPC unchanged for flexibility)

COMMENT ON COLUMN knowledge_documents.metadata IS 'Phase 2: ocr_used, char_count, page_count, chunk_count, embedding_model, error';
