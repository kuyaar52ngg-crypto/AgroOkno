-- Советники Supabase: фиксируем search_path у movement_sign.
alter function public.movement_sign(public.movement_kind) set search_path = '';
