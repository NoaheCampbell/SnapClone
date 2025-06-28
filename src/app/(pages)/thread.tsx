import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ThreadMessage {
  id: number;
  content: string;
  sender_id: string;
  created_at: string;
  sender_name: string;
  avatar_url: string | null;
  is_own_message: boolean;
  media_url?: string;
}

export default function ThreadPage() {
  const router = useRouter();
  const { messageId, circleId } = useLocalSearchParams<{ messageId: string; circleId: string }>();
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [rootMessage, setRootMessage] = useState<ThreadMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [newThreadMessage, setNewThreadMessage] = useState('');
  const [sendingThreadMessage, setSendingThreadMessage] = useState(false);
  const [loadingThread, setLoadingThread] = useState(true);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (messageId && circleId) {
      loadThread();
      const unsubscribe = subscribeToThreadUpdates();
      
      // Simple polling every 2 seconds as fallback
      pollingIntervalRef.current = setInterval(() => {
        loadThreadMessages();
      }, 2000);
      
      return () => {
        unsubscribe();
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
  }, [messageId, circleId, user?.id]);

  const loadThread = async () => {
    try {
      setLoadingThread(true);
      
      // Get root message details
      const { data: rootData, error: rootError } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          media_url,
          sender_id,
          created_at,
          profiles!messages_sender_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('id', messageId)
        .single();

      if (rootError) throw rootError;

      const rootMsg: ThreadMessage = {
        id: rootData.id,
        content: rootData.content || '',
        sender_id: rootData.sender_id,
        created_at: rootData.created_at,
        sender_name: (rootData as any).profiles?.username || 'Unknown',
        avatar_url: (rootData as any).profiles?.avatar_url || null,
        is_own_message: rootData.sender_id === user?.id,
        media_url: rootData.media_url
      };
      
      setRootMessage(rootMsg);

      // Get thread messages
      const { data: threadData, error: threadError } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          media_url,
          sender_id,
          created_at,
          profiles!messages_sender_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('thread_root_id', messageId)
        .neq('id', messageId)
        .order('created_at', { ascending: true });

      if (threadError) throw threadError;

      const messages: ThreadMessage[] = threadData.map(msg => ({
        id: msg.id,
        content: msg.content || '',
        sender_id: msg.sender_id,
        created_at: msg.created_at,
        sender_name: (msg as any).profiles?.username || 'Unknown',
        avatar_url: (msg as any).profiles?.avatar_url || null,
        is_own_message: msg.sender_id === user?.id,
        media_url: msg.media_url
      }));

      setThreadMessages(messages);
    } catch (error) {
      console.error('Error loading thread:', error);
    } finally {
      setLoadingThread(false);
    }
  };

  const loadThreadMessages = async () => {
    if (!messageId) return;
    
    try {
      const { data: threadData, error: threadError } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          media_url,
          sender_id,
          created_at,
          profiles!messages_sender_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('thread_root_id', messageId)
        .neq('id', messageId)
        .order('created_at', { ascending: true });

      if (threadError) throw threadError;

      const messages: ThreadMessage[] = threadData.map(msg => ({
        id: msg.id,
        content: msg.content || '',
        sender_id: msg.sender_id,
        created_at: msg.created_at,
        sender_name: (msg as any).profiles?.username || 'Unknown',
        avatar_url: (msg as any).profiles?.avatar_url || null,
        is_own_message: msg.sender_id === user?.id,
        media_url: msg.media_url
      }));

      setThreadMessages(messages);
    } catch (error) {
      console.error('Error loading thread messages:', error);
    }
  };

  const subscribeToThreadUpdates = () => {
    const subscription = supabase
      .channel(`thread:${messageId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_root_id=eq.${messageId}`
        },
        async (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.id.toString() === messageId) return; // Skip root message
          
          // Fetch sender info
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('user_id', newMsg.sender_id)
            .single();

          const message: ThreadMessage = {
            id: newMsg.id,
            content: newMsg.content || '',
            sender_id: newMsg.sender_id,
            created_at: newMsg.created_at,
            sender_name: profile?.username || 'Unknown',
            avatar_url: profile?.avatar_url || null,
            is_own_message: newMsg.sender_id === user?.id,
            media_url: newMsg.media_url
          };

          setThreadMessages(prev => {
            // Check if message already exists to avoid duplicates
            const exists = prev.some(m => m.id === message.id);
            if (exists) return prev;
            return [...prev, message];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  };

  const sendThreadMessage = async () => {
    if (!newThreadMessage.trim() || !user) return;
    
    const messageText = newThreadMessage.trim();
    setNewThreadMessage('');
    setSendingThreadMessage(true);

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          circle_id: circleId,
          sender_id: user.id,
          content: messageText,
          thread_root_id: parseInt(messageId)
        });

      if (error) throw error;

      // Update join count
      const newJoinCount = threadMessages.length + 2;
      
      await supabase
        .from('messages')
        .update({ 
          join_count: newJoinCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', messageId);

    } catch (error) {
      console.error('Error sending thread message:', error);
      setNewThreadMessage(messageText);
    } finally {
      setSendingThreadMessage(false);
    }
  };

  const renderThreadMessage = ({ item }: { item: ThreadMessage }) => {
    const isOwnMessage = item.is_own_message;
    
    return (
      <View className={`flex-row ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-3 px-4`}>
        {!isOwnMessage && (
          <Image
            source={item.avatar_url ? { uri: item.avatar_url } : require('../../../assets/images/avatar-placeholder.png')}
            className="w-8 h-8 rounded-full mr-2"
          />
        )}
        <View className={`max-w-[80%] ${isOwnMessage ? 'bg-blue-600' : 'bg-gray-700'} rounded-lg p-3`}>
          {!isOwnMessage && (
            <Text className="text-gray-300 text-xs mb-1">{item.sender_name}</Text>
          )}
          {item.media_url && (
            <Image source={{ uri: item.media_url }} className="w-48 h-48 rounded mb-2" />
          )}
          {item.content ? (
            <Text className="text-white">{item.content}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold">Thread</Text>
          <View style={{ width: 24 }} />
        </View>

        {loadingThread ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="white" />
          </View>
        ) : (
          <>
            {/* Root Message */}
            {rootMessage && (
              <View className="border-b border-gray-800 p-4 bg-gray-900">
                <View className="flex-row">
                  <Image
                    source={rootMessage.avatar_url ? { uri: rootMessage.avatar_url } : require('../../../assets/images/avatar-placeholder.png')}
                    className="w-10 h-10 rounded-full mr-3"
                  />
                  <View className="flex-1">
                    <Text className="text-white font-semibold">{rootMessage.sender_name}</Text>
                    {rootMessage.media_url && (
                      <Image source={{ uri: rootMessage.media_url }} className="w-48 h-48 rounded mt-2 mb-2" />
                    )}
                    {rootMessage.content ? (
                      <Text className="text-white mt-1">{rootMessage.content}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            )}

            {/* Thread Messages */}
            <FlatList
              ref={flatListRef}
              data={threadMessages}
              renderItem={renderThreadMessage}
              keyExtractor={(item) => item.id.toString()}
              className="flex-1"
              onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            />

            {/* Input */}
            <View className="border-t border-gray-800 p-4">
              <View className="flex-row items-center">
                <TextInput
                  value={newThreadMessage}
                  onChangeText={setNewThreadMessage}
                  placeholder="Reply to thread..."
                  placeholderTextColor="#9CA3AF"
                  className="flex-1 bg-gray-800 text-white p-3 rounded-full mr-2"
                  onSubmitEditing={sendThreadMessage}
                />
                <TouchableOpacity
                  onPress={sendThreadMessage}
                  disabled={!newThreadMessage.trim() || sendingThreadMessage}
                  className={`p-3 rounded-full ${newThreadMessage.trim() ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  <Feather name="send" size={20} color="white" />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
} 