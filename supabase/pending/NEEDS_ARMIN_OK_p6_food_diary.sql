-- NEEDS ARMIN'S OK. Requires applied T8b security (private.my_client_id and private.can_manage_client).
-- Back up clients.data.nutrition; this migration does NOT alter legacy records.
BEGIN;
CREATE TABLE public.food_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  idempotency_key uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('estimate','confirmed','incomplete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id,idempotency_key), UNIQUE (id,client_id)
);
CREATE INDEX food_entries_client_day_idx ON public.food_entries(client_id,date DESC);
CREATE TABLE public.food_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entry_id uuid NOT NULL,
 client_id text NOT NULL,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
 quantity numeric NOT NULL CHECK (quantity > 0 AND quantity < 100000),
 unit text NOT NULL CHECK (unit IN ('g','oz','cup','tbsp','piece','serving')),
 grams numeric CHECK (grams >= 0),
 state text NOT NULL CHECK (state IN ('raw','cooked','unknown')),
 kcal numeric CHECK (kcal >= 0), protein numeric CHECK (protein >= 0),
 source text NOT NULL CHECK (source IN ('label','restaurant','USDA','generic','manual')),
 "sourceId" text, assumptions text NOT NULL DEFAULT '', version text NOT NULL DEFAULT 'food-v1',
 "kcalPerGram" numeric CHECK ("kcalPerGram" >= 0),
 "proteinPerGram" numeric CHECK ("proteinPerGram" >= 0),
 FOREIGN KEY (entry_id,client_id) REFERENCES public.food_entries(id,client_id) ON DELETE CASCADE
);
CREATE INDEX food_items_entry_idx ON public.food_items(entry_id);
CREATE TABLE public.favorite_meals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
 items jsonb NOT NULL CHECK (jsonb_typeof(items)='array'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_meals ENABLE ROW LEVEL SECURITY;
GRANT SELECT,DELETE ON public.food_entries TO authenticated;
GRANT SELECT ON public.food_items TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.favorite_meals TO authenticated;
CREATE POLICY food_entries_read ON public.food_entries FOR SELECT TO authenticated
 USING (client_id=private.my_client_id() OR private.can_manage_client(client_id));
CREATE POLICY food_entries_client_delete ON public.food_entries FOR DELETE TO authenticated
 USING (client_id=private.my_client_id());
CREATE POLICY food_items_read ON public.food_items FOR SELECT TO authenticated
 USING (client_id=private.my_client_id() OR private.can_manage_client(client_id));
CREATE POLICY favorite_meals_read ON public.favorite_meals FOR SELECT TO authenticated
 USING (client_id=private.my_client_id() OR private.can_manage_client(client_id));
CREATE POLICY favorite_meals_client_insert ON public.favorite_meals FOR INSERT TO authenticated
 WITH CHECK (client_id=private.my_client_id());
CREATE POLICY favorite_meals_client_delete ON public.favorite_meals FOR DELETE TO authenticated
 USING (client_id=private.my_client_id());
-- Full atomic upsert; retries with identical key replace the same row and items; never double-log.
CREATE FUNCTION public.pf_save_food_entry(p_client_id text,p_existing_id uuid,p_date date,p_description text,
 p_key uuid,p_status text,p_items jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid; item jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_client_id IS DISTINCT FROM private.my_client_id() THEN
  RAISE EXCEPTION 'Own food records only' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_date > current_date + 1 OR p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'Invalid entry' USING ERRCODE='22023'; END IF;
 IF p_status NOT IN ('estimate','confirmed','incomplete') OR jsonb_typeof(p_items)<>'array' OR
   jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid meal items'; END IF;
 IF p_existing_id IS NOT NULL THEN
   SELECT id INTO eid FROM public.food_entries WHERE id=p_existing_id AND client_id=p_client_id FOR UPDATE;
   IF eid IS NULL THEN RAISE EXCEPTION 'Meal not found or access denied' USING ERRCODE='42501'; END IF;
 ELSE
   SELECT id INTO eid FROM public.food_entries WHERE client_id=p_client_id AND idempotency_key=p_key FOR UPDATE;
 END IF;
 IF eid IS NULL THEN
   INSERT INTO public.food_entries(client_id,date,description,idempotency_key,status)
     VALUES(p_client_id,p_date,trim(p_description),p_key,p_status) RETURNING id INTO eid;
 ELSE
   UPDATE public.food_entries SET date=p_date,description=trim(p_description),status=p_status WHERE id=eid;
 END IF;
 DELETE FROM public.food_items WHERE entry_id=eid AND client_id=p_client_id;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   IF length(trim(coalesce(item->>'name',''))) NOT BETWEEN 1 AND 200
      OR coalesce((item->>'quantity')::numeric,0) <= 0 THEN RAISE EXCEPTION 'Invalid food'; END IF;
   INSERT INTO public.food_items(entry_id,client_id,name,quantity,unit,grams,state,kcal,protein,source,"sourceId",assumptions,version,"kcalPerGram","proteinPerGram")
   VALUES(eid,p_client_id,trim(item->>'name'),(item->>'quantity')::numeric,item->>'unit',
     NULLIF(item->>'grams','')::numeric,coalesce(item->>'state','unknown'),
     NULLIF(item->>'kcal','')::numeric,NULLIF(item->>'protein','')::numeric,
     coalesce(item->>'source','manual'),item->>'sourceId',coalesce(item->>'assumptions',''),
     coalesce(item->>'version','food-v1'),NULLIF(item->>'kcalPerGram','')::numeric,NULLIF(item->>'proteinPerGram','')::numeric);
 END LOOP;
 RETURN eid;
END;$$;
REVOKE ALL ON FUNCTION public.pf_save_food_entry(text,uuid,date,text,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pf_save_food_entry(text,uuid,date,text,uuid,text,jsonb) TO authenticated;
COMMIT;
