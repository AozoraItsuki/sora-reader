import React from 'react';
import { Appbar as PaperAppbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemeColors } from '../../theme/types';

interface AppbarProps {
  title: string;
  handleGoBack?: () => void;
  theme: ThemeColors;
  mode?: 'small' | 'medium' | 'large' | 'center-aligned';
  children?: React.ReactNode;
}

const Appbar: React.FC<AppbarProps> = ({
  title,
  handleGoBack,
  theme,
  mode = 'large',
  children,
}) => {
  // `StatusBar.currentHeight` is always 0 on iOS and goes stale when the app
  // enters fullscreen, so the safe-area inset is the only reliable source.
  const { top } = useSafeAreaInsets();

  return (
    <PaperAppbar.Header
      style={{ backgroundColor: theme.surface }}
      statusBarHeight={top}
      mode={mode}
    >
      {handleGoBack && (
        <PaperAppbar.BackAction
          onPress={handleGoBack}
          iconColor={theme.onSurface}
        />
      )}
      <PaperAppbar.Content
        title={title}
        titleStyle={{ color: theme.onSurface }}
      />
      {children}
    </PaperAppbar.Header>
  );
};

export default Appbar;
