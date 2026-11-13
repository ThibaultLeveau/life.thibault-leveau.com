-- Never reactivate a session that was revoked after this backup was taken.
DO $$
BEGIN
    IF to_regclass('public.login_sessions') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.login_sessions';
    END IF;
END;
$$;
