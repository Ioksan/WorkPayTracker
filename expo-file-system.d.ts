declare module 'expo-file-system' {
  export const documentDirectory: string;
  export const cacheDirectory: string;
  export const bundleDirectory: string;
  export const appleSharedContainers: Record<string, string> | undefined;

  export enum EncodingType {
    UTF8 = 'utf8',
    BASE64 = 'base64',
  }

  export function writeAsStringAsync(fileUri: string, contents: string, options?: { encoding?: EncodingType }): Promise<void>;
  export function readAsStringAsync(fileUri: string, options?: { encoding?: EncodingType }): Promise<string>;
}
