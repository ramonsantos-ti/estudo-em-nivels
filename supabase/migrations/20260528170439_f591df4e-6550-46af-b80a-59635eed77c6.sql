
CREATE TABLE public.themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.subthemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  subtheme_id uuid REFERENCES public.subthemes(id) ON DELETE SET NULL,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 4),
  number int,
  intro text,
  command text NOT NULL,
  alt_a text NOT NULL,
  alt_b text NOT NULL,
  alt_c text NOT NULL,
  alt_d text NOT NULL,
  alt_e text NOT NULL,
  correct char(1) NOT NULL CHECK (correct IN ('A','B','C','D','E')),
  exp_a text,
  exp_b text,
  exp_c text,
  exp_d text,
  exp_e text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.themes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subthemes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO anon, authenticated;
GRANT ALL ON public.themes, public.subthemes, public.questions TO service_role;

ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subthemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public access themes" ON public.themes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public access subthemes" ON public.subthemes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public access questions" ON public.questions FOR ALL USING (true) WITH CHECK (true);
