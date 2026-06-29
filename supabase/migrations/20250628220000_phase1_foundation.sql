-- GMC Platform — Phase 1 Foundation
-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'power_user', 'user', 'guest');
CREATE TYPE agent_visibility AS ENUM ('private', 'team', 'public');
CREATE TYPE entity_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE document_status AS ENUM ('processing', 'ready', 'error');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE attachment_kind AS ENUM ('image', 'pdf', 'doc', 'other');
CREATE TYPE flow_run_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- Departments & Teams
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles (1-1 auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'user',
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Models registry
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]',
  input_price_per_mtok NUMERIC(10, 6) NOT NULL DEFAULT 0,
  output_price_per_mtok NUMERIC(10, 6) NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_allowed_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, model_id)
);

CREATE TABLE user_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  monthly_token_limit BIGINT,
  monthly_cost_limit_eur NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  requests_per_minute INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Skills catalog
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  config_schema JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  visibility agent_visibility NOT NULL DEFAULT 'private',
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status entity_status NOT NULL DEFAULT 'draft',
  current_version_id UUID,
  rating NUMERIC(3, 2) DEFAULT 0,
  downloads INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version INT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.7,
  tools JSONB NOT NULL DEFAULT '[]',
  knowledge_refs JSONB NOT NULL DEFAULT '[]',
  skills JSONB NOT NULL DEFAULT '[]',
  status entity_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, version)
);

ALTER TABLE agents
  ADD CONSTRAINT agents_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES agent_versions(id) ON DELETE SET NULL;

-- Knowledge Base
CREATE TABLE knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime TEXT,
  status document_status NOT NULL DEFAULT 'processing',
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content JSONB NOT NULL,
  tokens_prompt INT DEFAULT 0,
  tokens_completion INT DEFAULT 0,
  model TEXT,
  cost_eur NUMERIC(10, 6) DEFAULT 0,
  feedback INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime TEXT,
  kind attachment_kind NOT NULL DEFAULT 'other',
  filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Marketplace (architecture)
CREATE TABLE agent_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

CREATE TABLE agent_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

CREATE TABLE agent_clones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_agent_id UUID NOT NULL REFERENCES agents(id),
  cloned_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  cloned_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Flows (architecture)
CREATE TABLE flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status entity_status NOT NULL DEFAULT 'draft',
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  version INT NOT NULL,
  graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  status entity_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flow_id, version)
);

CREATE TABLE flow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  flow_version_id UUID NOT NULL REFERENCES flow_versions(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  status flow_run_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE flow_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  status flow_run_status NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Observability
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  cost_eur NUMERIC(10, 6) NOT NULL DEFAULT 0,
  latency_ms INT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cost_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  team_id UUID REFERENCES teams(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  total_cost_eur NUMERIC(12, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE publish_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_version_id UUID NOT NULL REFERENCES agent_versions(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  label TEXT,
  encrypted_key TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RAG: match_chunks RPC
CREATE OR REPLACE FUNCTION match_chunks(
  p_agent_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> p_query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.agent_id = p_agent_id
    AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

-- Role helpers
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Enable RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_allowed_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_clones ENABLE ROW LEVEL SECURITY;
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE publish_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "profiles_select_own_or_admin" ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL
  USING (is_admin());

CREATE POLICY "departments_read" ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_read" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_admin" ON departments FOR ALL USING (is_admin());
CREATE POLICY "teams_admin" ON teams FOR ALL USING (is_admin());

CREATE POLICY "models_read" ON models FOR SELECT TO authenticated USING (enabled = true);
CREATE POLICY "models_admin" ON models FOR ALL USING (is_admin());

CREATE POLICY "skills_read" ON skills FOR SELECT TO authenticated USING (enabled = true);
CREATE POLICY "skills_admin" ON skills FOR ALL USING (is_admin());

CREATE POLICY "agents_select" ON agents FOR SELECT
  USING (
    owner_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'team' AND team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid()))
    OR is_admin()
  );
CREATE POLICY "agents_insert" ON agents FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "agents_update" ON agents FOR UPDATE USING (owner_id = auth.uid() OR is_admin());
CREATE POLICY "agents_delete" ON agents FOR DELETE USING (owner_id = auth.uid() OR is_admin());

CREATE POLICY "agent_versions_select" ON agent_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = agent_versions.agent_id
      AND (a.owner_id = auth.uid() OR a.visibility = 'public' OR is_admin())
    )
  );
CREATE POLICY "agent_versions_insert" ON agent_versions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_id AND a.owner_id = auth.uid())
  );
CREATE POLICY "agent_versions_update" ON agent_versions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_id AND (a.owner_id = auth.uid() OR is_admin()))
  );

CREATE POLICY "knowledge_docs_owner" ON knowledge_documents FOR ALL
  USING (EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()));
CREATE POLICY "knowledge_chunks_owner" ON knowledge_chunks FOR ALL
  USING (EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()));

CREATE POLICY "conversations_owner" ON conversations FOR ALL USING (user_id = auth.uid());
CREATE POLICY "messages_owner" ON messages FOR ALL
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "attachments_owner" ON attachments FOR ALL
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

CREATE POLICY "usage_logs_own" ON usage_logs FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "audit_logs_admin" ON audit_logs FOR SELECT USING (is_admin());
CREATE POLICY "cost_rollups_own" ON cost_rollups FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "flows_owner" ON flows FOR ALL USING (owner_id = auth.uid() OR is_admin());
CREATE POLICY "flow_versions_owner" ON flow_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_id AND f.owner_id = auth.uid()));
CREATE POLICY "flow_runs_owner" ON flow_runs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "flow_run_steps_owner" ON flow_run_steps FOR ALL
  USING (EXISTS (SELECT 1 FROM flow_runs r WHERE r.id = run_id AND r.user_id = auth.uid()));

CREATE POLICY "favorites_own" ON agent_favorites FOR ALL USING (user_id = auth.uid());
CREATE POLICY "follows_own" ON agent_follows FOR ALL USING (user_id = auth.uid());
CREATE POLICY "clones_own" ON agent_clones FOR SELECT USING (cloned_by = auth.uid());
CREATE POLICY "api_keys_admin" ON api_keys FOR ALL USING (is_admin());
CREATE POLICY "user_allowed_models_own" ON user_allowed_models FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "user_quotas_own" ON user_quotas FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "rate_limits_admin" ON rate_limits FOR ALL USING (is_admin());
CREATE POLICY "publish_approvals_admin" ON publish_approvals FOR ALL USING (is_admin());

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('attachments', 'attachments', false, 52428800),
  ('knowledge', 'knowledge', false, 104857600),
  ('agent-images', 'agent-images', true, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "attachments_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "attachments_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "knowledge_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "knowledge_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "agent_images_public_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agent-images');
CREATE POLICY "agent_images_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Seed data
INSERT INTO models (id, provider, display_name, capabilities, input_price_per_mtok, output_price_per_mtok) VALUES
  ('claude-sonnet-4-20250514', 'anthropic', 'Claude Sonnet 4', '["chat","vision","tools"]', 3.0, 15.0),
  ('claude-3-5-haiku-20241022', 'anthropic', 'Claude 3.5 Haiku', '["chat","vision","tools"]', 0.8, 4.0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO skills (key, name, description, icon, category, config_schema) VALUES
  ('web_search', 'Web Search', 'Search the internet for current information', 'search', 'research', '{"max_results":{"type":"number","default":5}}'),
  ('read_document', 'Read Document', 'Extract text from PDF, Word, Excel, PowerPoint, CSV, and text files', 'file-text', 'documents', '{}'),
  ('vision', 'Vision', 'Analyze images and screenshots with Claude Vision', 'eye', 'multimodal', '{"max_images":{"type":"number","default":5}}'),
  ('knowledge_search', 'Knowledge Search', 'Semantic search across agent knowledge base', 'book-open', 'knowledge', '{"top_k":{"type":"number","default":5}}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO departments (name) VALUES ('Media Capital') ON CONFLICT DO NOTHING;
