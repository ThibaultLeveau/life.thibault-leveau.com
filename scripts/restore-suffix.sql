-- Never reactivate a session that was revoked after this backup was taken.
DO $$
BEGIN
    -- A restored run must never resume work, and its pending proposals are stale.
    IF to_regclass('public.assistant_runs') IS NOT NULL THEN
        EXECUTE 'UPDATE public.assistant_runs SET status = ''interrupted'', cancelled = true WHERE status = ''running''';
    END IF;
    IF to_regclass('public.assistant_messages') IS NOT NULL THEN
        EXECUTE 'UPDATE public.assistant_messages SET status = ''interrupted'' WHERE status = ''running''';
    END IF;
    IF to_regclass('public.assistant_operations') IS NOT NULL THEN
        EXECUTE 'UPDATE public.assistant_operations SET status = ''failed'' WHERE status = ''preview''';
    END IF;
    IF to_regclass('public.login_sessions') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.login_sessions';
    END IF;
END;
$$;
