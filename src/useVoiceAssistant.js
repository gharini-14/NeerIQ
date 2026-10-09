import { useState, useRef, useEffect, useCallback } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function useVoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [lang, setLang] = useState('en-IN');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef(null);
  const synthesisRef = useRef(window.speechSynthesis);

  // Initialize recognition
  useEffect(() => {
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false; // Stop automatically when the user stops speaking
      rec.interimResults = true;
      recognitionRef.current = rec;
    }
  }, []);

  // Update language when it changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang;
    }
  }, [lang]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  const startListening = useCallback(() => {
    setError('');
    
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Try Microsoft Edge or Google Chrome.');
      return;
    }

    const rec = recognitionRef.current;
    
    // Safety check to prevent starting if already started
    if (isListening) {
      return;
    }

    rec.onstart = () => {
      setIsListening(true);
      setTranscript(''); // Clear old transcript on fresh start
    };

    rec.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      
      // Update transcript in real time. We prefer final, but fallback to interim for smooth UI.
      setTranscript(final || interim);
    };

    rec.onerror = (event) => {
      setIsListening(false);
      
      let message = 'An unknown microphone error occurred.';
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          message = 'Microphone access denied. Please click the lock icon in the URL bar to allow access.';
          break;
        case 'no-speech':
          message = 'No speech detected. Please try speaking again.';
          break;
        case 'network':
          message = 'Network error. A reliable internet connection is required for speech recognition.';
          break;
        case 'aborted':
          message = 'Listening was stopped.';
          break;
        case 'audio-capture':
          message = 'No microphone was found. Ensure it is plugged in and working.';
          break;
        case 'language-not-supported':
          message = `The language '${lang}' is not supported by your browser.`;
          break;
      }
      
      // We don't want to spam "no speech" if the user simply didn't say anything, but we'll show it for clarity
      if (event.error !== 'aborted') {
        setError(message);
      }
    };

    rec.onend = () => {
      setIsListening(false);
    };

    try {
      rec.start();
    } catch (err) {
      setIsListening(false);
      setError(`Failed to start microphone: ${err.message}`);
    }
  }, [isListening, lang]);

  const speak = useCallback((text) => {
    if (!text || !window.speechSynthesis) return;

    // Cancel any ongoing speech
    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    // Best effort language matching for TTS
    utterance.lang = lang === 'ta-IN' ? 'ta-IN' : 'en-US'; 
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthesisRef.current.speak(utterance);
  }, [lang]);

  const stopSpeaking = useCallback(() => {
    if (synthesisRef.current && synthesisRef.current.speaking) {
      synthesisRef.current.cancel();
    }
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore abort errors on cleanup
        }
      }
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    error,
    lang,
    setLang,
    isSpeaking,
    isSupported: !!SpeechRecognition,
    startListening,
    stopListening,
    clearTranscript,
    speak,
    stopSpeaking
  };
}
