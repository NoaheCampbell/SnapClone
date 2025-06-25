import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, ScrollView } from 'react-native';
import { supabase } from '../../../lib/supabase';

export default function TestEdge() {
  const [circleId, setCircleId] = useState('');
  const [topic, setTopic] = useState('');
  const [tags, setTags] = useState(''); // comma-separated
  const [mediaPath, setMediaPath] = useState('');
  const [circleName, setCircleName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => setLogs((l) => [msg, ...l]);

  const handleCreateCircle = async () => {
    if (!circleName) {
      Alert.alert('Circle name required');
      return;
    }
    const { data, error } = await supabase.functions.invoke('createCircle', {
      body: {
        name: circleName,
        visibility: 'private',
      },
    });
    if (error) {
      log(`createCircle error: ${error.message}`);
    } else {
      log(`createCircle ➜ ${data?.name} (${data?.circle_id})`);
      log(`Invite code: ${data?.invite_code}`);
      setCircleId(data?.circle_id || '');
    }
  };

  const handleJoinCircle = async () => {
    if (!inviteCode && !circleId) {
      Alert.alert('Provide invite code or circle ID');
      return;
    }
    const { data, error } = await supabase.functions.invoke('joinCircle', {
      body: inviteCode ? { invite_code: inviteCode } : { circle_id: circleId },
    });
    if (error) {
      log(`joinCircle error: ${error.message}`);
    } else {
      log(`joinCircle ➜ joined ${data?.name}`);
    }
  };

  const handleStartSprint = async () => {
    if (!circleId || !topic) {
      Alert.alert('Circle ID and Topic required');
      return;
    }
    const { data, error } = await supabase.functions.invoke('startSprint', {
      body: {
        circle_id: circleId,
        topic,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      },
    });
    if (error) {
      log(`startSprint error: ${error.message}`);
    } else {
      log(`startSprint ➜ sprint_id ${data?.sprint_id}`);
    }
  };

  const handleDeleteMedia = async () => {
    if (!mediaPath) {
      Alert.alert('Provide object path e.g. 123.jpg');
      return;
    }
    const { data, error } = await supabase.functions.invoke('deleteMessageMedia', {
      body: {
        files: [{ bucket: 'chat-media', path: mediaPath }],
      },
    });
    if (error) {
      log(`deleteMedia error: ${error.message}`);
    } else {
      log(`deleteMedia result: ${JSON.stringify(data)}`);
    }
  };

  const handleGetCircles = async () => {
    const { data, error } = await supabase.rpc('get_user_circles');
    if (error) {
      log(`get_user_circles error: ${error.message}`);
    } else {
      log(`My circles: ${data?.length || 0} found`);
      data?.forEach((circle: any) => {
        log(`- ${circle.name} (${circle.id.substring(0, 8)}...)`);
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
        Edge Function Tester
      </Text>

      <Text style={{ fontWeight: 'bold' }}>createCircle</Text>
      <TextInput
        placeholder="Circle Name"
        value={circleName}
        onChangeText={setCircleName}
        style={{ borderWidth: 1, padding: 8, marginVertical: 4 }}
      />
      <Button title="Create Circle" onPress={handleCreateCircle} />

      <View style={{ height: 16 }} />

      <Text style={{ fontWeight: 'bold' }}>joinCircle</Text>
      <TextInput
        placeholder="Invite Code"
        value={inviteCode}
        onChangeText={setInviteCode}
        style={{ borderWidth: 1, padding: 8, marginVertical: 4 }}
      />
      <Button title="Join by Invite Code" onPress={handleJoinCircle} />

      <View style={{ height: 16 }} />

      <Text style={{ fontWeight: 'bold' }}>startSprint</Text>
      <TextInput
        placeholder="Circle ID (auto-filled from create)"
        value={circleId}
        onChangeText={setCircleId}
        style={{ borderWidth: 1, padding: 8, marginVertical: 4 }}
      />
      <TextInput
        placeholder="Topic"
        value={topic}
        onChangeText={setTopic}
        style={{ borderWidth: 1, padding: 8, marginVertical: 4 }}
      />
      <TextInput
        placeholder="Tags (comma-separated)"
        value={tags}
        onChangeText={setTags}
        style={{ borderWidth: 1, padding: 8, marginVertical: 4 }}
      />
      <Button title="Start Sprint" onPress={handleStartSprint} />

      <View style={{ height: 16 }} />

      <Text style={{ fontWeight: 'bold' }}>deleteMessageMedia</Text>
      <TextInput
        placeholder="Object path in chat-media bucket (e.g. 123.jpg)"
        value={mediaPath}
        onChangeText={setMediaPath}
        style={{ borderWidth: 1, padding: 8, marginVertical: 4 }}
      />
      <Button title="Delete Media" onPress={handleDeleteMedia} />

      <View style={{ height: 16 }} />

      <Text style={{ fontWeight: 'bold' }}>Database Queries</Text>
      <Button title="Get My Circles" onPress={handleGetCircles} />

      <View style={{ height: 24 }} />

      <Text style={{ fontWeight: 'bold' }}>Logs</Text>
      {logs.map((l, idx) => (
        <Text key={idx} style={{ fontFamily: 'Courier', marginVertical: 2, fontSize: 12 }}>
          {l}
        </Text>
      ))}
    </ScrollView>
  );
} 