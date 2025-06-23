import { StyleSheet, Image } from 'react-native';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

import EditScreenInfo from '@/components/EditScreenInfo';
import { Text, View } from '@/components/Themed';

export default function TabOneScreen() {
  useEffect(() => {
    // Simple call to verify the Supabase client works
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error('Supabase connection error:', error);
        } else {
          console.log('Supabase session data:', data);
        }
      })
      .catch((err) => console.error('Unexpected Supabase error:', err));
  }, []);

  return (
    <View style={styles.container}>
      <Image 
        source={require('@/assets/images/gauntletai.png')} 
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>hello gauntlet</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <EditScreenInfo path="app/(tabs)/index.tsx" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
