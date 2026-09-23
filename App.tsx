import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { createNavigationContainerRef, DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { colors, font } from './src/theme';
import { StoreProvider } from './src/data/store';
import { Icon, T, tap } from './src/components/ui';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import HomeScreen from './src/screens/HomeScreen';
import MonthScreen from './src/screens/MonthScreen';
import PlansScreen from './src/screens/PlansScreen';
import TableScreen from './src/screens/TableScreen';
import MoreScreen from './src/screens/MoreScreen';
import EntryFormScreen from './src/screens/EntryFormScreen';
import InvoiceScreen from './src/screens/InvoiceScreen';
import { CardFormScreen, CardsScreen } from './src/screens/CardsScreens';
import { CategoriesScreen, CategoryFormScreen } from './src/screens/CategoriesScreens';
import CycleScreen from './src/screens/CycleScreen';
import UpcomingScreen from './src/screens/UpcomingScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import NotificationCenterScreen from './src/screens/NotificationCenterScreen';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<string, [string, string, string]> = {
  Home: ['view-dashboard', 'view-dashboard-outline', 'Início'],
  Month: ['format-list-bulleted-square', 'format-list-bulleted-square', 'Mês'],
  Table: ['table-large', 'table-large', 'Tabela'],
  More: ['dots-grid', 'dots-grid', 'Mais'],
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom + 6 }]}>
      {state.routes.map((route, index) => {
        if (route.name === 'Add') {
          return (
            <View key={route.key} style={styles.tabItem}>
              <Pressable
                onPress={() => { tap(); navigation.getParent()?.navigate('EntryForm', {}); }}
                style={({ pressed }) => [styles.addButton, pressed && { transform: [{ scale: 0.94 }] }]}
              >
                <Icon name="plus" size={30} color="#062414" />
              </Pressable>
            </View>
          );
        }
        const focused = state.index === index;
        const [on, off, label] = TAB_ICONS[route.name];
        return (
          <Pressable
            key={route.key}
            style={styles.tabItem}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) { tap(); navigation.navigate(route.name); }
            }}
          >
            <View style={[styles.tabPill, { backgroundColor: focused ? colors.primarySoft : 'transparent' }]}>
              <Icon name={focused ? on : off} size={23} color={focused ? colors.primary : colors.muted} />
            </View>
            <T size={11.5} weight={focused ? 'semibold' : 'medium'} color={focused ? colors.text : colors.muted}>{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

function Tabs() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <Tab.Navigator tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Month" component={MonthScreen} />
      <Tab.Screen name="Add" component={HomeScreen} />
      <Tab.Screen name="Table" component={TableScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
    {/* faixa atrás da status bar para o conteúdo não rolar por baixo do relógio */}
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.bg }} />
    </View>
  );
}

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.primary, text: colors.text, border: colors.border },
};

export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // o aviso é curto de propósito: tocar nele leva para a central, onde está o detalhe
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      if (navigationRef.isReady()) navigationRef.navigate('NotificationCenter');
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <NavigationContainer ref={navigationRef} theme={navTheme}>
          <StatusBar style="light" />
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontFamily: font.semibold, fontSize: 17 },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="EntryForm" component={EntryFormScreen} options={{ title: 'Novo lançamento', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Invoice" component={InvoiceScreen} options={{ title: 'Fatura' }} />
            <Stack.Screen name="Cards" component={CardsScreen} options={{ title: 'Cartões' }} />
            <Stack.Screen name="CardForm" component={CardFormScreen} options={{ title: 'Cartão' }} />
            <Stack.Screen name="Categories" component={CategoriesScreen} options={{ title: 'Categorias' }} />
            <Stack.Screen name="Cycle" component={CycleScreen} options={{ title: 'Ciclo do mês' }} />
            <Stack.Screen name="Upcoming" component={UpcomingScreen} options={{ title: 'Próximos pagamentos' }} />
            <Stack.Screen name="Plans" component={PlansScreen} options={{ title: 'Planejamento' }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Lembretes' }} />
            <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} options={{ title: 'Central de avisos' }} />
            <Stack.Screen name="CategoryForm" component={CategoryFormScreen} options={{ title: 'Categoria' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabPill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  addButton: {
    width: 54, height: 54, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    marginTop: -2, elevation: 6, shadowColor: colors.primary,
  },
});
