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
      // 1. Resolve DM circles for all recipients first
      // ---------------------------------------------------------
      const circleMap = new Map<string, string>(); // recipientId -> circleId
      for (const rid of selectedIds) {
        const circleId = await ensureDmCircle(rid);
        if (circleId) circleMap.set(rid, circleId);
      }

      if (circleMap.size === 0) {
        console.warn('[SendTo] No circles resolved, aborting');
        return;
      }

      // ---------------------------------------------------------
      // 2. Upload media once to chat-media bucket
      // ---------------------------------------------------------
      const firstCircleId = Array.from(circleMap.values())[0];
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
      const path = `${firstCircleId}/${Date.now()}.${fileExt}`;

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
      // 3. Insert a message in every circle referencing this image
      // ---------------------------------------------------------
      for (const [rid, circleId] of circleMap.entries()) {
        const { error: msgErr } = await supabase.from('messages').insert({
          circle_id: circleId,
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

  const ensureDmCircle = async (otherId: string): Promise<string | null> => {
    try {
      // Step 1: find circle ids where current user is a member
      const { data: myLinks, error: myErr } = await supabase
        .from('circle_members')
        .select('circle_id')
        .eq('user_id', user!.id);
      if (myErr) throw myErr;

      const myIds = (myLinks || []).map((l: any) => l.circle_id);
      if (myIds.length === 0) myIds.push(''); // prevent empty IN

      // Step 2: look for a private circle with exactly two members (current user and other user)
      const { data: candidates, error: candErr } = await supabase
        .from('circles')
        .select('id, visibility')
        .in('id', myIds)
        .eq('visibility', 'private');
      if (candErr) throw candErr;

      for (const circle of candidates || []) {
        // fetch members for circle
        const { data: members } = await supabase
          .from('circle_members')
          .select('user_id')
          .eq('circle_id', circle.id);
        const memberIds = (members || []).map((m: any) => m.user_id);
        if (memberIds.length === 2 && memberIds.includes(otherId) && memberIds.includes(user!.id)) {
          return circle.id;
        }
      }

      // none found, create new DM circle
      const { data: circleRow, error: circleErr } = await supabase
        .from('circles')
        .insert({ 
          name: 'DM', // Will be displayed as usernames in UI
          visibility: 'private',
          owner: user!.id,
          sprint_minutes: 25,
          ttl_minutes: 1440 // 24 hours
        })
        .select('id')
        .single();
      if (circleErr) throw circleErr;

      await supabase.from('circle_members').insert([
        { circle_id: circleRow.id, user_id: user!.id, role: 'member' },
        { circle_id: circleRow.id, user_id: otherId, role: 'member' },
      ]);

      return circleRow.id;
    } catch (e) {
      console.warn('ensureDmCircle error', e);
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
