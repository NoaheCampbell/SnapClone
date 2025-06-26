import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

export default function SendToModal() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['95%'], []);
  const navigation = useNavigation();

  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const { user } = useAuth();

  type Friend = {
    user_id: string;
    username: string;
    display_name?: string;
    avatar_url?: string;
  };

  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Open sheet immediately (index 0 is our only snap point)
    requestAnimationFrame(() => bottomSheetRef.current?.snapToIndex(0));

    fetchFriends();

    return () => {
      bottomSheetRef.current?.close();
    };
  }, []);

  const fetchFriends = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // Get friend links where the current user is either side
      const { data: links, error } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      if (error) throw error;

      const otherIds = (links || []).map((l: any) => (l.user_id === user.id ? l.friend_id : l.user_id));

      if (otherIds.length === 0) {
        setFriends([]);
        return;
      }

      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', otherIds);

      if (pErr) throw pErr;

      setFriends(profiles || []);
    } catch (err) {
      console.warn('fetchFriends error', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFriend = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedCount = () => selectedIds.size;

  const handleSend = async () => {
    if (!uri || selectedIds.size === 0 || !user) {
      return;
    }
    try {
      setSending(true);

      // ---------------------------------------------------------
      // 1. Resolve DM channels for all recipients first
      // ---------------------------------------------------------
      const channelMap = new Map<string, string>(); // recipientId -> channelId
      for (const rid of selectedIds) {
        const chId = await ensureDmChannel(rid);
        if (chId) channelMap.set(rid, chId);
      }

      if (channelMap.size === 0) {
        console.warn('[SendTo] No channels resolved, aborting');
        return;
      }

      // ---------------------------------------------------------
      // 2. Upload media once to chat-media bucket
      // ---------------------------------------------------------
      const firstChannelId = Array.from(channelMap.values())[0];
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';

      // Map extension to appropriate MIME
      const mimeMap: Record<string,string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      const contentType = mimeMap[fileExt] || `image/${fileExt}`;
      // Read local file as base64 to avoid malformed fetch results on some platforms
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuf = decode(base64);
      const path = `${firstChannelId}/${Date.now()}.${fileExt}`;

      const { error: upErr } = await supabase.storage.from('chat-media').upload(path, arrayBuf as any, {
        cacheControl: '3600',
        contentType,
      });

      if (upErr && upErr.message !== 'The resource already exists') {
        console.warn('[SendTo] Upload error', upErr);
        throw upErr;
      }


      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(path);

      // ---------------------------------------------------------
      // 3. Insert a message in every channel referencing this image
      // ---------------------------------------------------------
      for (const [rid, channelId] of channelMap.entries()) {
        const { error: msgErr } = await supabase.from('messages').insert({
          channel_id: channelId,
          sender_id: user.id,
          media_url: publicUrl,
          content: '',
        });
        if (msgErr) {
          console.warn('[SendTo] message insert error', msgErr);
        }
      }

    } catch (e) {
      console.warn('send snap error', e);
    } finally {
      setSending(false);
      bottomSheetRef.current?.close();
    }
  };

  const ensureDmChannel = async (otherId: string): Promise<string | null> => {
    try {
      // Step 1: find channel ids where current user is a member
      const { data: myLinks, error: myErr } = await supabase
        .from('channel_members')
        .select('channel_id')
        .eq('member_id', user!.id);
      if (myErr) throw myErr;

      const myIds = (myLinks || []).map((l: any) => l.channel_id);
      if (myIds.length === 0) myIds.push(''); // prevent empty IN

      // Step 2: look for a channel that also contains the other user and is not a group (is_group = false) and exactly two members
      const { data: candidates, error: candErr } = await supabase
        .from('channels')
        .select('id, is_group, channel_members(count)', { count: 'exact' })
        .in('id', myIds)
        .eq('is_group', false);
      if (candErr) throw candErr;

      for (const ch of candidates || []) {
        // fetch members for channel
        const { data: members } = await supabase
          .from('channel_members')
          .select('member_id')
          .eq('channel_id', ch.id);
        const memberIds = (members || []).map((m: any) => m.member_id);
        if (memberIds.length === 2 && memberIds.includes(otherId) && memberIds.includes(user!.id)) {
          return ch.id;
        }
      }

      // none found, create new
      const { data: channelRow, error: chErr } = await supabase
        .from('channels')
        .insert({ is_group: false })
        .select('id')
        .single();
      if (chErr) throw chErr;

      await supabase.from('channel_members').insert([
        { channel_id: channelRow.id, member_id: user!.id },
        { channel_id: channelRow.id, member_id: otherId },
      ]);

      return channelRow.id;
    } catch (e) {
      console.warn('ensureDmChannel error', e);
      return null;
    }
  };

  return (
    <View style={{ flex: 1 }} pointerEvents="box-none">
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      enableDynamicSizing={false}
      snapPoints={snapPoints}
      backdropComponent={useCallback(
        (props: any) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} opacity={0.4} />
        ),
        []
      )}
      backgroundStyle={{ backgroundColor: '#1E1E1E' }}
      handleIndicatorStyle={{ backgroundColor: 'white' }}
      onClose={() => navigation.goBack()}
    >
      <BottomSheetView style={{ flex: 1, padding: 16 }}>
        <View className="flex-row justify-between items-center mb-4">
            <Text className="text-white text-2xl font-bold">Send To</Text>
            <TouchableOpacity onPress={() => bottomSheetRef.current?.close()}>
                <Feather name="x" size={24} color="white" />
            </TouchableOpacity>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search friends..."
          placeholderTextColor="gray"
          className="bg-neutral-800 rounded-lg p-2 text-white mb-4"
        />
        {loading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          <FlatList
            data={friends.filter((f) =>
              (f.display_name || f.username || '')
                .toLowerCase()
                .includes(search.toLowerCase())
            )}
            keyExtractor={(item) => item.user_id}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.user_id);
              return (
                <TouchableOpacity
                  onPress={() => toggleFriend(item.user_id)}
                  className="flex-row items-center p-2"
                >
                  {item.avatar_url ? (
                    <Image
                      source={{ uri: item.avatar_url }}
                      className="w-12 h-12 rounded-full mr-4"
                    />
                  ) : (
                    <Image
                      source={require('../../../assets/images/avatar-placeholder.png')}
                      className="w-12 h-12 rounded-full mr-4"
                      resizeMode="cover"
                    />
                  )}
                  <Text className="text-white text-lg flex-1">
                    {item.display_name || item.username}
                  </Text>
                  <View
                    className={`w-6 h-6 rounded-full border-2 ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-400'}`}
                  />
                </TouchableOpacity>
              );
            }}
          />
        )}
        <TouchableOpacity
          onPress={handleSend}
          disabled={selectedCount() === 0 || sending}
          className={`py-3 rounded-lg mt-4 ${selectedCount() > 0 ? 'bg-indigo-500' : 'bg-gray-500'}`}
        >
          <Text className="text-white text-center font-bold text-lg">{sending ? 'Sending...' : 'Send'}</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
    </View>
  );
}
