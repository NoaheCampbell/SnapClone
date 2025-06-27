import { View, Text, TouchableOpacity, TextInput, Switch, Alert, ScrollView } from 'react-native'
import React, { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../../../lib/supabase'

export default function NewChatScreen() {
  const [circleName, setCircleName] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [sprintMinutes, setSprintMinutes] = useState(25)
  const [ttlMinutes, setTtlMinutes] = useState(30)
  const [allowMemberInvites, setAllowMemberInvites] = useState(true)
  const [creating, setCreating] = useState(false)

  const sprintOptions = [10, 15, 20, 25, 30, 45, 60]
  const ttlOptions = [15, 30, 60, 120, 240]

  const createCircle = async () => {
    if (!circleName.trim() || creating) return

    try {
      setCreating(true)
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      // Create the circle
      const { data: circleData, error: circleError } = await supabase
        .from('circles')
        .insert({
          name: circleName.trim(),
          owner: auth.user.id,
          visibility: isPublic ? 'public' : 'private',
          sprint_minutes: sprintMinutes,
          ttl_minutes: ttlMinutes,
          allow_member_invites: allowMemberInvites
        })
        .select()
        .single()

      if (circleError) throw circleError

      // Add creator as owner
      const { error: memberError } = await supabase
        .from('circle_members')
        .insert({
          circle_id: circleData.id,
          user_id: auth.user.id,
          role: 'owner'
        })

      if (memberError) throw memberError

      // Navigate to the new circle
      router.replace(`/(modals)/chat?circleId=${circleData.id}`)
    } catch (error) {
      console.error('Error creating circle:', error)
      Alert.alert('Error', 'Failed to create circle. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="flex-row items-center p-4 border-b border-gray-800">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Feather name="x" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold flex-1">
            Create Circle
          </Text>
          <TouchableOpacity
            onPress={createCircle}
            disabled={!circleName.trim() || creating}
            className={`px-4 py-2 rounded-full ${
              circleName.trim() && !creating ? 'bg-blue-500' : 'bg-gray-600'
            }`}
          >
            <Text className="text-white font-semibold">
              {creating ? 'Creating...' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View className="p-4">
          {/* Circle Name */}
          <View className="mb-6">
            <Text className="text-gray-400 text-sm mb-2">Circle Name</Text>
            <TextInput
              value={circleName}
              onChangeText={setCircleName}
              placeholder="Enter circle name..."
              placeholderTextColor="#6B7280"
              className="bg-gray-800 text-white text-base px-4 py-3 rounded-lg"
              maxLength={50}
              autoFocus
            />
          </View>

          {/* Visibility Toggle */}
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-gray-400 text-sm">Visibility</Text>
              <View className="flex-row items-center">
                <Feather 
                  name={isPublic ? 'globe' : 'lock'} 
                  size={16} 
                  color={isPublic ? '#10B981' : '#6B7280'} 
                  style={{ marginRight: 8 }}
                />
                <Text className={`text-sm ${isPublic ? 'text-green-500' : 'text-gray-500'}`}>
                  {isPublic ? 'Public' : 'Private'}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center justify-between bg-gray-800 px-4 py-3 rounded-lg">
              <Text className="text-white">Make circle discoverable</Text>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: '#374151', true: '#10B981' }}
                thumbColor="white"
              />
            </View>
            <Text className="text-gray-500 text-xs mt-1">
              {isPublic 
                ? 'Anyone can find and join this circle' 
                : 'Only invited members can join'}
            </Text>
          </View>

          {/* Sprint Duration */}
          <View className="mb-6">
            <Text className="text-gray-400 text-sm mb-2">Sprint Duration (minutes)</Text>
            <View className="flex-row flex-wrap">
              {sprintOptions.map((minutes) => (
                <TouchableOpacity
                  key={minutes}
                  onPress={() => setSprintMinutes(minutes)}
                  className={`px-4 py-2 rounded-full mr-2 mb-2 ${
                    sprintMinutes === minutes ? 'bg-blue-500' : 'bg-gray-800'
                  }`}
                >
                  <Text className={`${
                    sprintMinutes === minutes ? 'text-white' : 'text-gray-400'
                  }`}>
                    {minutes}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Photo TTL */}
          <View className="mb-6">
            <Text className="text-gray-400 text-sm mb-2">Photo Expiry (minutes)</Text>
            <View className="flex-row flex-wrap">
              {ttlOptions.map((minutes) => (
                <TouchableOpacity
                  key={minutes}
                  onPress={() => setTtlMinutes(minutes)}
                  className={`px-4 py-2 rounded-full mr-2 mb-2 ${
                    ttlMinutes === minutes ? 'bg-blue-500' : 'bg-gray-800'
                  }`}
                >
                  <Text className={`${
                    ttlMinutes === minutes ? 'text-white' : 'text-gray-400'
                  }`}>
                    {minutes < 60 ? minutes : `${minutes/60}h`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-gray-500 text-xs mt-1">
              Photos will disappear after this time
            </Text>
          </View>

          {/* Member Invites */}
          <View className="mb-6">
            <View className="flex-row items-center justify-between bg-gray-800 px-4 py-3 rounded-lg">
              <View className="flex-1 mr-3">
                <Text className="text-white">Allow members to invite</Text>
                <Text className="text-gray-500 text-xs mt-1">
                  Members can create invite links
                </Text>
              </View>
              <Switch
                value={allowMemberInvites}
                onValueChange={setAllowMemberInvites}
                trackColor={{ false: '#374151', true: '#10B981' }}
                thumbColor="white"
              />
            </View>
          </View>

          {/* Info Box */}
          <View className="bg-gray-800/50 p-4 rounded-lg">
            <View className="flex-row items-start">
              <Feather name="info" size={16} color="#9CA3AF" style={{ marginTop: 2, marginRight: 8 }} />
              <View className="flex-1">
                <Text className="text-gray-400 text-sm leading-5">
                  After creating your circle, you can invite friends or share an invite link. 
                  You can change these settings later in circle settings.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
} 