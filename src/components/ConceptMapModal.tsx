import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { WebView } from 'react-native-webview';

interface ConceptMapModalProps {
  visible: boolean;
  sprintId: string;
  sprintTopic: string;
  onClose: () => void;
}

export default function ConceptMapModal({ 
  visible, 
  sprintId, 
  sprintTopic, 
  onClose 
}: ConceptMapModalProps) {
  const [conceptMapData, setConceptMapData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (visible && sprintId) {
      loadConceptMap();
    }
  }, [visible, sprintId]);

  const loadConceptMap = async () => {
    setLoading(true);
    try {
      // Check if concept map already exists
      const { data: summary, error } = await supabase
        .from('summaries')
        .select('concept_map_data, bullets, tags')
        .eq('sprint_id', sprintId)
        .single();

      if (error) {
        console.error('Error loading concept map:', error);
        return;
      }

      if (summary?.concept_map_data) {
        setConceptMapData(summary.concept_map_data);
      } else {
        // No concept map exists, can generate one
        setConceptMapData(null);
      }
    } catch (error) {
      console.error('Error loading concept map:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateConceptMap = async () => {
    setGenerating(true);
    try {
      // Get summary data first
      const { data: summary, error: summaryError } = await supabase
        .from('summaries')
        .select('bullets, tags')
        .eq('sprint_id', sprintId)
        .single();

      if (summaryError || !summary) {
        Alert.alert('Error', 'Could not find summary data for this sprint.');
        return;
      }

      // Generate concept map using RAG
      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generateConceptMap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          sprintId,
          topic: sprintTopic,
          summaryBullets: summary.bullets || [],
          tags: summary.tags || []
        })
      });

      if (response.ok) {
        const result = await response.json();
        setConceptMapData(result.conceptMap);
        console.log('Concept map generated successfully');
      } else {
        Alert.alert('Error', 'Failed to generate concept map. Please try again.');
      }
    } catch (error) {
      console.error('Error generating concept map:', error);
      Alert.alert('Error', 'Failed to generate concept map. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const parseMermaidToText = (mermaidCode: string): string => {
    if (!mermaidCode) return '';
    
    // Simple parsing to extract node information and connections
    const lines = mermaidCode.split('\n').filter(line => line.trim());
    const nodes: { [key: string]: string } = {};
    const connections: string[] = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Extract node definitions (A[Label], B((Label)), etc.)
      const nodeMatch = trimmed.match(/(\w+)\[(.*?)\]|\w+\(\((.*?)\)\)/);
      if (nodeMatch) {
        const nodeId = nodeMatch[1];
        const label = nodeMatch[2] || nodeMatch[3];
        if (nodeId && label) {
          nodes[nodeId] = label;
        }
      }
      
      // Extract connections (A --> B, A -.-> B, etc.)
      const connectionMatch = trimmed.match(/(\w+)\s*[-\.]*>\s*(\w+)/);
      if (connectionMatch) {
        const from = nodes[connectionMatch[1]] || connectionMatch[1];
        const to = nodes[connectionMatch[2]] || connectionMatch[2];
        connections.push(`${from} → ${to}`);
      }
    });
    
    return connections.join('\n');
  };

  // Helper to wrap Mermaid code in an HTML document the WebView can render
  const generateMermaidHTML = (code: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>body{margin:0;background:#000;color:#fff;}</style>
      <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js"></script>
    </head>
    <body>
      <div class="mermaid">
      ${code}
      </div>
      <script>mermaid.initialize({startOnLoad:true, theme:'dark'});</script>
    </body>
    </html>
  `;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView className="flex-1 bg-black">
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
          <TouchableOpacity onPress={onClose}>
            <Text className="text-blue-400 text-lg">Close</Text>
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold">Concept Map</Text>
          <View className="w-12" />
        </View>

        {/* Content */}
        <View className="flex-1 p-4">
          <Text className="text-white text-xl font-semibold mb-2">{sprintTopic}</Text>
          <Text className="text-gray-400 text-sm mb-4">
            Visual representation of concepts and their relationships
          </Text>

          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text className="text-gray-400 mt-2">Loading concept map...</Text>
            </View>
          ) : conceptMapData ? (
            <View className="flex-1">
              <WebView
                originWhitelist={["*"]}
                source={{ html: generateMermaidHTML(conceptMapData) }}
                style={{ flex: 1, backgroundColor: 'transparent' }}
                javaScriptEnabled
                scrollEnabled={true}
              />
              <View className="bg-gray-800 rounded-lg p-3">
                <Text className="text-gray-400 text-xs text-center">
                  💡 This concept map is generated from your study history using Retrieval-Augmented Generation
                </Text>
              </View>
            </View>
          ) : (
            <View className="flex-1 justify-center items-center px-8">
              <Feather name="map" size={64} color="gray" />
              <Text className="text-gray-400 text-lg mt-4 text-center">
                No concept map available
              </Text>
              <Text className="text-gray-500 text-sm mt-2 text-center mb-6">
                Generate a visual concept map that connects this topic to your previous studies
              </Text>
              
              <TouchableOpacity 
                onPress={generateConceptMap}
                disabled={generating}
                className="bg-blue-600 rounded-lg px-6 py-3 flex-row items-center"
              >
                {generating ? (
                  <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                ) : (
                  <Feather name="map" size={16} color="white" style={{ marginRight: 8 }} />
                )}
                <Text className="text-white font-medium">
                  {generating ? 'Generating...' : 'Generate Concept Map'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
} 