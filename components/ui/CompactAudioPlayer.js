import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Animated, Modal } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import { Colors } from '../../constants/theme';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// Visual layer for the seeker to make it look small/premium
const VisualSlider = ({ progress, vertical = false, color = Colors.dark.primary }) => {
  const percent = `${(progress * 100).toFixed(2)}%`;
  return (
    <View style={[styles.visualTrackWrap, vertical && styles.visualTrackVertical]}>
      <View style={[styles.visualTrack, vertical ? styles.visualTrackVertical : styles.visualTrackHorizontal]}>
        <View 
          style={[
            styles.visualProgress, 
            vertical 
              ? { height: percent, width: '100%', bottom: 0, position: 'absolute', backgroundColor: '#fff' }
              : { width: percent, height: '100%', backgroundColor: color }
          ]} 
        />
        <View 
          style={[
            styles.customThumb,
            vertical 
              ? { bottom: percent, marginBottom: -7, left: -5 }
              : { left: percent, marginLeft: -7, top: -5 }
          ]}
        />
      </View>
    </View>
  );
};

const CompactAudioPlayer = ({ url, fileName, isMe, timestamp }) => {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [showVolume, setShowVolume] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  
  const volumeAnim = useRef(new Animated.Value(0)).current;
  const volumeBtnRef = useRef(null);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const toggleVolume = () => {
    if (!showVolume) {
      volumeBtnRef.current?.measureInWindow((x, y, width, height) => {
        // Popover height is 130. We add a 5px gap by using y - 135.
        // Center 36px wide popover over ~30px wide button.
        setPopoverPos({ top: y - 135, left: x - 3 });
        setShowVolume(true);
        Animated.spring(volumeAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 40
        }).start();
      });
    } else {
      Animated.timing(volumeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true
      }).start(() => setShowVolume(false));
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      if (!isSeeking) {
        setPosition(status.positionMillis);
      }
      setDuration(status.durationMillis);
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        sound?.setPositionAsync(0);
      }
    }
  };

  const playPause = async () => {
    if (isLoading) return;

    try {
      if (sound) {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          if (isPlaying) {
            await sound.pauseAsync();
          } else {
            await sound.playAsync();
          }
        } else {
          await sound.unloadAsync();
          setSound(null);
          setIsLoading(true);
          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: url },
            { shouldPlay: true, volume: volume },
            onPlaybackStatusUpdate
          );
          setSound(newSound);
          setIsLoading(false);
        }
      } else {
        setIsLoading(true);
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true, volume: volume },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsLoading(false);
      setSound(null);
    }
  };

  const handleSeek = (value) => {
    setIsSeeking(true);
    setSeekValue(value);
  };

  const handleSeekComplete = async (value) => {
    if (sound) {
      try {
        await sound.setPositionAsync(value);
        setPosition(value);
      } catch (e) {
        console.warn('Seek failed:', e);
      } finally {
        setTimeout(() => setIsSeeking(false), 500);
      }
    } else {
      setPosition(value);
      setIsSeeking(false);
    }
  };

  const handleVolumeChange = async (value) => {
    setVolume(value);
    if (sound) {
      try {
        await sound.setVolumeAsync(value);
      } catch (e) {
        console.warn('Volume failed:', e);
      }
    }
  };

  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleDownload = async () => {
    if (!url || isDownloading) return;
    try {
      setIsDownloading(true);
      const filename = fileName || `audio_${Date.now()}.mp3`;

      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          // 1. Download to local cache first (as readAsStringAsync doesn't support remote URLs directly)
          const localUri = FileSystem.cacheDirectory + filename;
          await FileSystem.downloadAsync(url, localUri);
          
          // 2. Read from local cache
          const fileBase64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
          
          // 3. Create and write to SAF
          const uri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            'audio/mpeg'
          );
          await FileSystem.writeAsStringAsync(uri, fileBase64, { encoding: FileSystem.EncodingType.Base64 });
          
          // 4. Cleanup cache
          await FileSystem.deleteAsync(localUri, { idempotent: true });
          
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 3000);
        }
      } else {
        // iOS Flow
        const fileUri = FileSystem.cacheDirectory + filename;
        const downloadResult = await FileSystem.downloadAsync(url, fileUri);
        if (downloadResult.status === 200) {
          setDownloadSuccess(true);
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(downloadResult.uri, {
              dialogTitle: 'Save Audio Message',
              UTI: 'public.mp3',
            });
          }
          setTimeout(() => setDownloadSuccess(false), 3000);
        }
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const formatTime = (millis) => {
    if (!millis) return '0:00';
    const totalSeconds = millis / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentPos = isSeeking ? seekValue : position;
  const progressRatio = duration ? currentPos / duration : 0;

  return (
    <View style={styles.outerWrap}>
      <Modal visible={showVolume} transparent animationType="none" onRequestClose={toggleVolume}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={toggleVolume}>
          <Animated.View style={[styles.volumePopover, { opacity: volumeAnim, top: popoverPos.top, left: popoverPos.left, transform: [{ scale: volumeAnim }] }]}>
            <View style={{ width: 40, height: 100, justifyContent: 'center', alignItems: 'center' }}>
               <VisualSlider progress={volume} vertical />
               <Slider
                  style={styles.realSliderVertical}
                  minimumValue={0}
                  maximumValue={1}
                  value={volume}
                  onValueChange={handleVolumeChange}
                  thumbTintColor="transparent"
                  minimumTrackTintColor="transparent"
                  maximumTrackTintColor="transparent"
               />
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.outerContainer}>
        <BlurView intensity={70} tint="dark" style={styles.blurContainer}>
          <View style={styles.mainRow}>
            <TouchableOpacity onPress={playPause} style={styles.playButton}>
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name={isPlaying ? "pause" : "play"} size={22} color="#fff" />
              )}
            </TouchableOpacity>
            
            <View style={styles.playerCore}>
              <View style={styles.infoRow}>
                <Text style={styles.fileName} numberOfLines={1}>{fileName || 'Audio Message'}</Text>
                <View style={styles.topActions}>
                  <TouchableOpacity ref={volumeBtnRef} onPress={toggleVolume} style={styles.actionIcon}>
                    <Ionicons name={volume === 0 ? "volume-mute" : "volume-medium"} size={16} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDownload} style={styles.actionIcon}>
                    {isDownloading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons 
                        name={downloadSuccess ? "checkmark-done" : "cloud-download-outline"} 
                        size={downloadSuccess ? 19 : 17} 
                        color={downloadSuccess ? "#4ade80" : "#fff"} 
                      />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.sliderRow}>
                <View style={{ flex: 1, position: 'relative', height: 20, justifyContent: 'center' }}>
                  <VisualSlider progress={progressRatio} />
                  <Slider
                    style={styles.realSliderHorizontal}
                    minimumValue={0}
                    maximumValue={duration || 1}
                    value={currentPos}
                    onValueChange={handleSeek}
                    onSlidingComplete={handleSeekComplete}
                    thumbTintColor="transparent"
                    minimumTrackTintColor="transparent"
                    maximumTrackTintColor="transparent"
                  />
                </View>
                <Text style={styles.timeText}>{formatTime(currentPos)}</Text>
              </View>
            </View>
          </View>

          {timestamp && (
            <View style={styles.internalFooter}>
               <Text style={styles.smallTime}>{timestamp}</Text>
            </View>
          )}
        </BlurView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrap: {
    width: 270,
    marginVertical: 4,
  },
  outerContainer: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  blurContainer: {
    padding: 12,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.dark.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  playerCore: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  fileName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginRight: 8,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  volumePopover: {
    position: 'absolute',
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 8,
    height: 130,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    minWidth: 28,
  },
  internalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  smallTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
  // Visual layers
  visualTrackWrap: {
    position: 'absolute',
    width: '100%',
    height: 4,
    justifyContent: 'center',
  },
  visualTrackVertical: {
    width: 4,
    height: '100%',
    alignItems: 'center',
  },
  visualTrack: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
  },
  visualTrackHorizontal: {
    width: '100%',
    height: 4,
  },
  visualProgress: {
    borderRadius: 2,
  },
  customThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  // Real hidden sliders
  realSliderHorizontal: {
    width: '100%',
    height: 40,
    position: 'absolute',
    zIndex: 10,
  },
  realSliderVertical: {
    width: 100,
    height: 40,
    position: 'absolute',
    zIndex: 10,
    transform: [{ rotate: '-90deg' }],
  }
});

export default CompactAudioPlayer;
