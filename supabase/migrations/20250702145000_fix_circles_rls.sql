-- Fix circles table RLS policies to allow direct access

-- Enable RLS on circles table (if not already enabled)
ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to read circles they are members of
CREATE POLICY "Users can view circles they belong to" ON public.circles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.circle_members 
            WHERE circle_id = circles.id 
            AND user_id = auth.uid()
        )
    );

-- Policy: Allow circle owners to update their circles
CREATE POLICY "Circle owners can update their circles" ON public.circles
    FOR UPDATE USING (owner = auth.uid());

-- Policy: Allow circle owners to delete their circles
CREATE POLICY "Circle owners can delete their circles" ON public.circles
    FOR DELETE USING (owner = auth.uid());

-- Policy: Allow authenticated users to create circles
CREATE POLICY "Authenticated users can create circles" ON public.circles
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL); 