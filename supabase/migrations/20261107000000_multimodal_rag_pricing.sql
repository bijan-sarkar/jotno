-- ==============================================================================
-- GlucoVision Phase A Database Migration: Multimodal RAG, Price Benchmarks & Voice
-- ==============================================================================

-- Enable vector extension for RAG search
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Nutrition Reference Cache & Embeddings
CREATE TABLE IF NOT EXISTS public.nutrition_knowledge_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL CHECK (source IN ('usda', 'edamam', 'open_food_facts', 'nutritics', 'cloudcamp', 'clinical_baseline')),
    external_id TEXT,
    food_name TEXT NOT NULL,
    brand_or_category TEXT,
    serving_size_g NUMERIC(6,2) DEFAULT 100,
    calories NUMERIC(6,2),
    protein_g NUMERIC(6,2),
    carbs_g NUMERIC(6,2),
    fat_g NUMERIC(6,2),
    fiber_g NUMERIC(6,2),
    sugars_g NUMERIC(6,2),
    sodium_mg NUMERIC(6,2),
    glycemic_index NUMERIC(4,1),
    glycemic_load NUMERIC(4,1),
    micronutrients JSONB DEFAULT '{}'::jsonb,
    content_vector vector(768), -- Gemini text-embedding-004
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_vector ON public.nutrition_knowledge_nodes 
USING ivfflat (content_vector vector_cosine_ops) WITH (lists = 100);

-- 2. Kaggle & Local Food Price Benchmarks
CREATE TABLE IF NOT EXISTS public.ingredient_price_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_key TEXT NOT NULL UNIQUE,
    standard_unit TEXT DEFAULT 'kg' CHECK (standard_unit IN ('kg', 'g', 'liter', 'piece', 'bunch')),
    price_currency TEXT DEFAULT 'USD',
    average_unit_price NUMERIC(8,2) NOT NULL,
    market_region TEXT DEFAULT 'Global',
    source TEXT DEFAULT 'kaggle_food_prices',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial Kaggle global benchmark price reference points
INSERT INTO public.ingredient_price_benchmarks (ingredient_key, standard_unit, price_currency, average_unit_price, market_region, source)
VALUES
    ('red lentils', 'kg', 'USD', 1.80, 'Global', 'kaggle_food_prices'),
    ('lentils', 'kg', 'USD', 1.75, 'Global', 'kaggle_food_prices'),
    ('bitter gourd', 'kg', 'USD', 1.40, 'Global', 'kaggle_food_prices'),
    ('spinach', 'kg', 'USD', 1.20, 'Global', 'kaggle_food_prices'),
    ('potatoes', 'kg', 'USD', 0.85, 'Global', 'kaggle_food_prices'),
    ('white rice', 'kg', 'USD', 1.10, 'Global', 'kaggle_food_prices'),
    ('brown rice', 'kg', 'USD', 1.60, 'Global', 'kaggle_food_prices'),
    ('green chilies', 'kg', 'USD', 2.10, 'Global', 'kaggle_food_prices'),
    ('onion', 'kg', 'USD', 0.90, 'Global', 'kaggle_food_prices'),
    ('garlic', 'kg', 'USD', 3.20, 'Global', 'kaggle_food_prices'),
    ('ginger', 'kg', 'USD', 2.80, 'Global', 'kaggle_food_prices'),
    ('chicken breast', 'kg', 'USD', 4.50, 'Global', 'kaggle_food_prices'),
    ('eggs', 'piece', 'USD', 0.20, 'Global', 'kaggle_food_prices'),
    ('mustard oil', 'liter', 'USD', 2.40, 'Global', 'kaggle_food_prices'),
    ('olive oil', 'liter', 'USD', 6.50, 'Global', 'kaggle_food_prices'),
    ('okra', 'kg', 'USD', 1.50, 'Global', 'kaggle_food_prices'),
    ('cucumber', 'kg', 'USD', 0.95, 'Global', 'kaggle_food_prices'),
    ('tomatoes', 'kg', 'USD', 1.30, 'Global', 'kaggle_food_prices'),
    ('fish', 'kg', 'USD', 5.20, 'Global', 'kaggle_food_prices')
ON CONFLICT (ingredient_key) DO UPDATE
SET average_unit_price = EXCLUDED.average_unit_price,
    updated_at = NOW();

-- 3. Upgrade Food Scans for Multimodal Interaction
ALTER TABLE public.food_scans 
    ADD COLUMN IF NOT EXISTS scan_mode TEXT CHECK (scan_mode IN ('grocery_bazaar', 'restaurant_menu', 'prepared_food')),
    ADD COLUMN IF NOT EXISTS voice_prompt_transcript TEXT,
    ADD COLUMN IF NOT EXISTS rag_sources_retrieved JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS cost_estimate JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS health_risk_alerts JSONB DEFAULT '[]'::jsonb;

-- 4. Voice Audio Logs
CREATE TABLE IF NOT EXISTS public.voice_interaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    scan_id UUID REFERENCES public.food_scans(id) ON DELETE SET NULL,
    user_query TEXT NOT NULL,
    ai_response_text TEXT NOT NULL,
    ai_audio_latency_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.voice_interaction_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own voice logs" ON public.voice_interaction_logs;
CREATE POLICY "Users can manage own voice logs" 
    ON public.voice_interaction_logs FOR ALL 
    USING (auth.uid() = user_id);
