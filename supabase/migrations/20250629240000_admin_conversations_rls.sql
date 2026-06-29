-- Allow admins to read all conversations and messages for support/audit
CREATE POLICY "conversations_admin_read" ON conversations
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "messages_admin_read" ON messages
  FOR SELECT TO authenticated
  USING (is_admin());
