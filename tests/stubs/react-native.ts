// Ersatz für react-native in Node-Tests: nur, was die getesteten Module beim Laden brauchen.
export const Platform = { OS: 'web' as const, select: (o: Record<string, unknown>) => o.web ?? o.default };
export const Share = { share: async () => ({}) };
export const useColorScheme = () => 'light' as const;
export default { Platform, Share };
