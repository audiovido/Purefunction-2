-- WARNING: this rollback destroys NEW food diary entries; export them before running.
BEGIN;
DROP FUNCTION IF EXISTS public.pf_save_food_entry(text,uuid,date,text,uuid,text,jsonb);
DROP TABLE IF EXISTS public.favorite_meals;
DROP TABLE IF EXISTS public.food_items;
DROP TABLE IF EXISTS public.food_entries;
COMMIT;
