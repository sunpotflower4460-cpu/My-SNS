-- Keep messaging_contacts.last_message_at monotonic. Webhook providers can
-- redeliver older events after a newer message has already been ingested; a
-- plain UPSERT would otherwise move the contact's "last message" backwards
-- and corrupt recency ordering.

BEGIN;

CREATE OR REPLACE FUNCTION public.keep_messaging_contact_last_message_monotonic()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.last_message_at IS NOT NULL
     AND (NEW.last_message_at IS NULL OR NEW.last_message_at < OLD.last_message_at) THEN
    NEW.last_message_at := OLD.last_message_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_messaging_contact_last_message_monotonic
  ON public.messaging_contacts;
CREATE TRIGGER keep_messaging_contact_last_message_monotonic
  BEFORE UPDATE OF last_message_at ON public.messaging_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_messaging_contact_last_message_monotonic();

COMMENT ON FUNCTION public.keep_messaging_contact_last_message_monotonic() IS
  'Prevents delayed/retried webhook deliveries from moving messaging_contacts.last_message_at backwards.';

COMMIT;
