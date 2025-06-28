import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useRouter } from 'expo-router';

interface ConceptMapPageProps {
  sprintId: string;
  sprintTopic: string;
}

export default function ConceptMapPage({ 
  sprintId, 
  sprintTopic 
}: ConceptMapPageProps) {
  const router = useRouter();
  const [conceptMapData, setConceptMapData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showTextView, setShowTextView] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    if (sprintId) {
      loadConceptMap();
      // Allow landscape orientation when page is open
      ScreenOrientation.unlockAsync();
      
      // Listen for orientation changes
      const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
        setIsLandscape(
          event.orientationInfo.orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          event.orientationInfo.orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
        );
      });
      
      return () => {
        // Lock back to portrait when page closes
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        ScreenOrientation.removeOrientationChangeListener(subscription);
      };
    }
  }, [sprintId]);

  const loadConceptMap = async () => {
    setLoading(true);
    try {
      // Check if concept map already exists
      const { data: summaries, error } = await supabase
        .from('summaries')
        .select('concept_map_data, bullets, tags')
        .eq('sprint_id', sprintId);

      if (error) {
        console.error('Error loading concept map:', error);
        return;
      }

      // Handle case where no summary exists or multiple summaries exist
      const summary = summaries && summaries.length > 0 ? summaries[0] : null;

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
      const { data: summaries, error: summaryError } = await supabase
        .from('summaries')
        .select('bullets, tags')
        .eq('sprint_id', sprintId);

      if (summaryError) {
        console.error('Error fetching summary:', summaryError);
        Alert.alert('Error', 'Could not load summary data for this sprint.');
        return;
      }

      const summary = summaries && summaries.length > 0 ? summaries[0] : null;
      
      if (!summary) {
        Alert.alert('Notice', 'No summary found for this sprint. Please complete the sprint first.');
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

  const parseMermaidToText = (mermaidCode: string): { concepts: string[], relationships: string[] } => {
    if (!mermaidCode) return { concepts: [], relationships: [] };
    
    // Parse Mermaid diagram to extract structured information
    const lines = mermaidCode.split('\n').filter(line => line.trim());
    const nodes: { [key: string]: string } = {};
    const relationships: string[] = [];
    const concepts = new Set<string>();
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Extract node definitions (A[Label], B((Label)), C{Label}, etc.)
      const nodeMatch = trimmed.match(/(\w+)\[(.*?)\]|(\w+)\(\((.*?)\)\)|(\w+)\{(.*?)\}/);
      if (nodeMatch) {
        const nodeId = nodeMatch[1] || nodeMatch[3] || nodeMatch[5];
        const label = nodeMatch[2] || nodeMatch[4] || nodeMatch[6];
        if (nodeId && label) {
          nodes[nodeId] = label.replace(/"/g, '');
          concepts.add(label.replace(/"/g, ''));
        }
      }
      
      // Extract connections with labels (A -->|label| B, A -.-> B, etc.)
      const connectionMatch = trimmed.match(/(\w+)\s*[-\.]*>(?:\|(.*?)\|)?\s*(\w+)/);
      if (connectionMatch) {
        const from = nodes[connectionMatch[1]] || connectionMatch[1];
        const to = nodes[connectionMatch[3]] || connectionMatch[3];
        const label = connectionMatch[2];
        
        if (label) {
          relationships.push(`• ${from} ${label} ${to}`);
        } else {
          relationships.push(`• ${from} connects to ${to}`);
        }
      }
    });
    
    return {
      concepts: Array.from(concepts),
      relationships
    };
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

  const handleClose = () => {
    // Ensure we lock back to portrait when closing
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    setShowTextView(false);
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className={`flex-row items-center justify-between p-4 border-b border-gray-800 ${isLandscape ? 'pt-2 pb-2' : ''}`}>
        <TouchableOpacity onPress={handleClose}>
          <Feather name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold">Concept Map</Text>
        {conceptMapData ? (
          <TouchableOpacity 
            onPress={() => setShowTextView(!showTextView)}
            className="flex-row items-center"
          >
            <Feather 
              name={showTextView ? 'map' : 'file-text'} 
              size={20} 
              color="#3B82F6" 
            />
            {!isLandscape && (
              <Text className="text-blue-400 text-sm ml-1">
                {showTextView ? 'Map' : 'Text'}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Content */}
      <View className={`flex-1 ${isLandscape ? 'p-2' : 'p-4'}`}>
        {!isLandscape && (
          <>
            <Text className="text-white text-xl font-semibold mb-2">{sprintTopic}</Text>
            <Text className="text-gray-400 text-sm mb-4">
              {showTextView ? 'Structured breakdown of concepts' : 'Visual representation of concepts and their relationships'}
            </Text>
          </>
        )}

        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text className="text-gray-400 mt-2">Loading concept map...</Text>
          </View>
        ) : conceptMapData ? (
          showTextView ? (
            // Text View
            <ScrollView className="flex-1">
              <View className="bg-gray-900 rounded-lg p-4 mb-4">
                <Text className="text-blue-400 text-lg font-semibold mb-3">
                  📚 Key Concepts
                </Text>
                {parseMermaidToText(conceptMapData).concepts.map((concept, index) => (
                  <View key={index} className="flex-row items-start mb-2">
                    <Text className="text-blue-400 mr-2">•</Text>
                    <Text className="text-white flex-1">{concept}</Text>
                  </View>
                ))}
              </View>

              <View className="bg-gray-900 rounded-lg p-4 mb-4">
                <Text className="text-green-400 text-lg font-semibold mb-3">
                  🔗 Relationships & Connections
                </Text>
                {parseMermaidToText(conceptMapData).relationships.map((rel, index) => (
                  <Text key={index} className="text-gray-300 mb-2 leading-5">
                    {rel}
                  </Text>
                ))}
              </View>

              <View className="bg-gray-800 rounded-lg p-3 mb-4">
                <View className="flex-row items-center mb-2">
                  <Feather name="info" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                  <Text className="text-gray-400 text-sm font-semibold">How to Use This</Text>
                </View>
                <Text className="text-gray-400 text-xs leading-5">
                  • Review key concepts to reinforce your understanding{'\n'}
                  • Study the relationships to see how ideas connect{'\n'}
                  • Rotate your device for a better view of the visual map{'\n'}
                  • Use this to prepare for quizzes and exams
                </Text>
              </View>
            </ScrollView>
          ) : (
            // Map View
            <View className="flex-1">
              <WebView
                originWhitelist={["*"]}
                source={{ html: generateMermaidHTML(conceptMapData) }}
                style={{ flex: 1, backgroundColor: 'transparent' }}
                javaScriptEnabled
                scrollEnabled={true}
              />
              {!isLandscape && (
                <View className="bg-gray-800 rounded-lg p-3 mt-2">
                  <Text className="text-gray-400 text-xs text-center">
                    💡 Rotate your device for a better view • Generated from your study history
                  </Text>
                </View>
              )}
            </View>
          )
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
  );
} 