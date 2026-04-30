import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';
import { IconSymbol } from './icon-symbol';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * ActionMenu - A premium bottom sheet menu for choosing actions.
 * Used for "More" menus in headers or list items.
 */
export default function ActionMenu({ isVisible, onClose, options, title }) {
  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={onClose}>
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}>
        <View style={styles.sheetContainer}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetContent}>
            
            {/* Header / Title */}
            {(title || options?.length > 0) && (
              <View style={styles.sheetHeader}>
                <View style={styles.dragIndicator} />
                {title && <Text style={styles.sheetTitle}>{title}</Text>}
              </View>
            )}

            {/* Menu Items */}
            {options.map((option, index) => {
              const itemColor = option.color || (option.isDestructive ? '#ff4444' : Colors.dark.primary);
              const bgColor = itemColor + '1A'; // 10% opacity in hex

              return (
                <React.Fragment key={index}>
                  <TouchableOpacity 
                    style={styles.menuItem} 
                    onPress={() => {
                      onClose();
                      setTimeout(() => option.onPress(), 100);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: bgColor }]}>
                      <IconSymbol 
                        name={option.icon} 
                        size={22} 
                        color={itemColor} 
                      />
                    </View>
                    <Text style={[styles.menuText, { color: itemColor }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                  {index < options.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              );
            })}

            <SafeAreaView edges={['bottom']} style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </SafeAreaView>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#1e293b', // Match ActionModal deep slate
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: -100, // Aggressive bleed for Android bottom gaps
    paddingBottom: 100,
    minHeight: 200, // Ensure it doesn't collapse
  },
  sheetContent: {
    width: '100%',
    paddingHorizontal: 16,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(14, 240, 255, 0.1)', // #0ef0ff with opacity
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  destructiveIconBackground: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  menuText: {
    fontSize: 17,
    color: '#f3f4f6',
    fontWeight: '600',
  },
  destructiveText: {
    color: '#ff4444',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetFooter: {
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 0 : 20,
  },
  cancelBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#94a3b8',
  },
});
