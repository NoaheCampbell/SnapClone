-- Complete SnapClone Database Schema Migration
-- Creates all tables for the SnapClone application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    user_id UUID NOT NULL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_private BOOLEAN DEFAULT FALSE,
    allow_friend_requests BOOLEAN DEFAULT TRUE,
    show_last_active BOOLEAN DEFAULT TRUE,
    show_stories_to_friends_only BOOLEAN DEFAULT FALSE
);

-- Create channels table
CREATE TABLE IF NOT EXISTS channels (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    is_group BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create channel_members table
CREATE TABLE IF NOT EXISTS channel_members (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, member_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 seconds')
);

-- Create message_reads table
CREATE TABLE IF NOT EXISTS message_reads (
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reader_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, reader_id)
);

-- Create friends table
CREATE TABLE IF NOT EXISTS friends (
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, friend_id),
    CHECK (user_id != friend_id)
);

-- Create friend_requests table
CREATE TABLE IF NOT EXISTS friend_requests (
    id BIGSERIAL PRIMARY KEY,
    from_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    to_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (from_id != to_id),
    UNIQUE (from_id, to_id)
);

-- Create snaps table
CREATE TABLE IF NOT EXISTS snaps (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create snap_recipients table
CREATE TABLE IF NOT EXISTS snap_recipients (
    snap_id UUID NOT NULL REFERENCES snaps(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    opened_at TIMESTAMP WITH TIME ZONE,
    screenshot BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (snap_id, recipient_id)
);

-- Create stories table
CREATE TABLE IF NOT EXISTS stories (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    seen_by UUID[] DEFAULT ARRAY[]::UUID[]
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('friend_request', 'message', 'snap', 'story')),
    payload JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON messages(expires_at);

CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_member_id ON channel_members(member_id);

CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);

CREATE INDEX IF NOT EXISTS idx_friend_requests_from_id ON friend_requests(from_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to_id ON friend_requests(to_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status);

CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at);

CREATE INDEX IF NOT EXISTS idx_snaps_owner_id ON snaps(owner_id);
CREATE INDEX IF NOT EXISTS idx_snaps_expires_at ON snaps(expires_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE snaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (customize as needed)

-- Profiles: Users can read public profiles and update their own
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
    FOR SELECT USING (NOT is_private OR auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Messages: Users can only see messages in channels they're members of
CREATE POLICY "Users can view messages in their channels" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM channel_members 
            WHERE channel_id = messages.channel_id 
            AND member_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages in their channels" ON messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM channel_members 
            WHERE channel_id = messages.channel_id 
            AND member_id = auth.uid()
        )
    );

-- Friends: Users can view their own friendships
CREATE POLICY "Users can view their friendships" ON friends
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friendships" ON friends
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Friend requests: Users can view requests involving them
CREATE POLICY "Users can view their friend requests" ON friend_requests
    FOR SELECT USING (auth.uid() = from_id OR auth.uid() = to_id);

CREATE POLICY "Users can create friend requests" ON friend_requests
    FOR INSERT WITH CHECK (auth.uid() = from_id);

CREATE POLICY "Users can update friend requests sent to them" ON friend_requests
    FOR UPDATE USING (auth.uid() = to_id);

-- Stories: Users can view stories based on privacy settings
CREATE POLICY "Users can view stories" ON stories
    FOR SELECT USING (
        auth.uid() = user_id OR
        (
            NOT EXISTS (
                SELECT 1 FROM profiles 
                WHERE user_id = stories.user_id 
                AND show_stories_to_friends_only = TRUE
            ) OR
            EXISTS (
                SELECT 1 FROM friends 
                WHERE (user_id = stories.user_id AND friend_id = auth.uid()) 
                OR (user_id = auth.uid() AND friend_id = stories.user_id)
            )
        )
    );

CREATE POLICY "Users can create their own stories" ON stories
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Notifications: Users can only see their own notifications
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Create functions for common operations
CREATE OR REPLACE FUNCTION get_user_chats(user_uuid UUID)
RETURNS TABLE (
    channel_id UUID,
    is_group BOOLEAN,
    last_message_content TEXT,
    last_message_created_at TIMESTAMP WITH TIME ZONE,
    other_user_id UUID,
    other_username TEXT,
    other_display_name TEXT,
    other_avatar_url TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as channel_id,
        c.is_group,
        m.content as last_message_content,
        m.created_at as last_message_created_at,
        CASE 
            WHEN c.is_group THEN NULL
            ELSE (
                SELECT cm2.member_id 
                FROM channel_members cm2 
                WHERE cm2.channel_id = c.id 
                AND cm2.member_id != user_uuid 
                LIMIT 1
            )
        END as other_user_id,
        CASE 
            WHEN c.is_group THEN NULL
            ELSE (
                SELECT p.username 
                FROM profiles p 
                JOIN channel_members cm2 ON p.user_id = cm2.member_id
                WHERE cm2.channel_id = c.id 
                AND cm2.member_id != user_uuid 
                LIMIT 1
            )
        END as other_username,
        CASE 
            WHEN c.is_group THEN NULL
            ELSE (
                SELECT p.display_name 
                FROM profiles p 
                JOIN channel_members cm2 ON p.user_id = cm2.member_id
                WHERE cm2.channel_id = c.id 
                AND cm2.member_id != user_uuid 
                LIMIT 1
            )
        END as other_display_name,
        CASE 
            WHEN c.is_group THEN NULL
            ELSE (
                SELECT p.avatar_url 
                FROM profiles p 
                JOIN channel_members cm2 ON p.user_id = cm2.member_id
                WHERE cm2.channel_id = c.id 
                AND cm2.member_id != user_uuid 
                LIMIT 1
            )
        END as other_avatar_url
    FROM channels c
    JOIN channel_members cm ON c.id = cm.channel_id
    LEFT JOIN LATERAL (
        SELECT content, created_at 
        FROM messages 
        WHERE channel_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
    ) m ON true
    WHERE cm.member_id = user_uuid
    ORDER BY m.created_at DESC NULLS LAST;
END;
$$; 