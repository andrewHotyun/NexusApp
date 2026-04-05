import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { Colors } from '../../constants/theme';
import { IconSymbol } from './icon-symbol';

/**
 * A reusable searchable picker modal for mobile.
 * Optimized for large datasets like countries and cities.
 */
export const SearchablePicker = ({
  visible,
  onClose,
  onSelect,
  data = [],
  title = 'Select Option',
  placeholder = 'Search...',
  loading = false,
  selectedValue = ''
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Reset search when modal opens
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
    }
  }, [visible]);

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery) return data;
    const query = searchQuery.toLowerCase();
    return data.filter(item => 
      item.label.toLowerCase().includes(query) || 
      (item.value && item.value.toLowerCase().includes(query))
    );
  }, [data, searchQuery]);

  const renderItem = ({ item }) => {
    const isSelected = selectedValue === item.value;
    
    return (
      <TouchableOpacity 
        style={[styles.item, isSelected && styles.itemSelected]} 
        onPress={() => {
          onSelect(item);
          onClose();
        }}
        activeOpacity={0.7}>
        <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
          {item.label}
        </Text>
        {isSelected && (
          <IconSymbol name="checkmark" size={20} color={Colors.dark.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView 
          style={styles.keyboardView} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <IconSymbol name="xmark" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <IconSymbol name="magnifyingglass" size={18} color="#7f8c8d" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={placeholder}
              placeholderTextColor="#7f8c8d"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus={false}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* List Content */}
          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator color={Colors.dark.primary} size="large" />
            </View>
          ) : filteredData.length === 0 ? (
            <View style={styles.centerContent}>
              <Text style={styles.noResultsText}>No results found</Text>
            </View>
          ) : (
            <FlatList
              data={filteredData}
              keyExtractor={(item, index) => `${item.value || ''}-${index}`}
              renderItem={renderItem}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 15 : 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 73, 94, 0.6)',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#34495e',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: '100%',
  },
  listContent: {
    paddingBottom: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  itemSelected: {
    backgroundColor: 'rgba(14, 240, 255, 0.05)',
  },
  itemText: {
    color: '#bdc3c7',
    fontSize: 16,
  },
  itemTextSelected: {
    color: Colors.dark.primary,
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  noResultsText: {
    color: '#7f8c8d',
    fontSize: 16,
  },
});
