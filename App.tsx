import { StatusBar } from 'expo-status-bar';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Image,
  LayoutChangeEvent,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

type SetupStep =
  | 'welcome'
  | 'income'
  | 'expense'
  | 'target'
  | 'summary'
  | 'dashboard'
  | 'voice'
  | 'confirm'
  | 'extra';

type FixedRow = {
  id: string;
  name: string;
  amount: string;
};

type EntryType = 'expense' | 'income';

type EntryCategory =
  | 'salary'
  | 'freelance'
  | 'bonus'
  | 'food'
  | 'transport'
  | 'shopping'
  | 'education'
  | 'housing'
  | 'bill'
  | 'other';

type MoneyEntry = {
  id: string;
  type: EntryType;
  category: EntryCategory;
  title: string;
  amount: number;
  date: Date;
  source: 'voice' | 'manual';
};

type Period = 'Günlük' | 'Haftalık' | 'Aylık';

type ParsedVoice = {
  type: EntryType;
  category: EntryCategory;
  title: string;
  amount: number;
  transcript: string;
  date: Date;
};

const colors = {
  background: '#FBF8F1',
  surface: '#FFFFFF',
  surfaceWarm: '#F7F2E8',
  text: '#223027',
  textSoft: '#465246',
  muted: '#8B927F',
  faint: '#F1EDE3',
  line: '#E7E0D2',
  green: '#88A65C',
  greenDark: '#6F874B',
  greenDeep: '#405332',
  greenSoft: '#E8F0DA',
  greenMist: '#F2F7EA',
  red: '#B96B50',
  redSoft: '#F7E8DF',
};

const spacing = {
  screen: 20,
  card: 14,
  radius: 10,
};

const androidFooterClearance = Platform.OS === 'android' ? 48 : 0;

const welcomeLogoHero = require('./assets/welcome-logo-direct.png');

const incomePlaceholders = [
  'Gelir adı (örn. Maaş)',
  'Gelir adı (örn. Freelance)',
  'Gelir adı (örn. Kira Geliri)',
];

const expensePlaceholders = [
  'Gider adı (örn. Kira)',
  'Gider adı (örn. Fatura)',
  'Gider adı (örn. Market)',
];

const incomeDefaultLabels = ['Maaş', 'Freelance', 'Kira geliri'];

const formatter = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 0,
});

function parseAmount(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function money(value: number) {
  return `${formatter.format(Math.max(0, Math.round(value)))} TL`;
}

function formatEntryDate(date: Date, period: Period) {
  if (period === 'Günlük') {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  if (period === 'Haftalık') {
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  return `${date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function makeRows(prefix: string, placeholders: string[]) {
  return placeholders.map((_, index) => ({
    id: `${prefix}-${index + 1}`,
    name: '',
    amount: '',
  }));
}

function inferEntryCategory(text: string, type: EntryType): EntryCategory {
  const normalized = text.toLocaleLowerCase('tr-TR');

  if (type === 'income') {
    if (normalized.includes('maaş')) return 'salary';
    if (normalized.includes('freelance') || normalized.includes('serbest') || normalized.includes('ek iş')) {
      return 'freelance';
    }
    if (normalized.includes('prim') || normalized.includes('bonus') || normalized.includes('ikramiye')) {
      return 'bonus';
    }
    return 'other';
  }

  if (/(kahve|market|yemek|restoran|cafe|kafe|manav)/.test(normalized)) return 'food';
  if (/(otobüs|otobus|metro|dolmuş|dolmus|taksi|uber|yakıt|yakit|benzin)/.test(normalized)) {
    return 'transport';
  }
  if (/(kitap|kurs|okul|eğitim|egitim)/.test(normalized)) return 'education';
  if (/(kira|ev)/.test(normalized)) return 'housing';
  if (/(fatura|elektrik|su|doğalgaz|dogalgaz|internet|telefon)/.test(normalized)) return 'bill';
  if (/(giyim|alışveriş|alisveris|mağaza|magaza)/.test(normalized)) return 'shopping';
  return 'other';
}

function parseVoiceInput(raw: string): ParsedVoice | null {
  const transcript = raw.trim();
  if (!transcript) return null;

  const normalized = transcript
    .toLocaleLowerCase('tr-TR')
    .replace(/₺/g, ' tl')
    .replace(/\s+/g, ' ');

  const amountMatch = normalized.match(/(\d+(?:[.,]\d+)?)/);
  const amount = amountMatch ? parseAmount(amountMatch[1]) : 0;
  if (!amount) return null;

  const type: EntryType =
    normalized.includes('gelir') || normalized.includes('kazanç') ? 'income' : 'expense';

  const titlePart = normalized
    .replace(amountMatch?.[0] ?? '', '')
    .replace(/\b(tl|lira|liraya|ekstra|gelir|gider|harcama)\b/g, '')
    .trim();

  const fallback = type === 'income' ? 'Ekstra Gelir' : 'Harcama';
  const title = titlePart
    ? titlePart.charAt(0).toLocaleUpperCase('tr-TR') + titlePart.slice(1)
    : fallback;
  const category = inferEntryCategory(title, type);

  return { type, category, title, amount, transcript, date: new Date() };
}

function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: object;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function AppHeader({
  title,
  subtitle,
  onBack,
  progress,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  progress?: number;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        {onBack ? (
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpace} />
        )}
        {progress ? (
          <View style={styles.stepProgress}>
            {[1, 2, 3].map((item) => (
              <View
                key={item}
                style={[styles.stepSegment, item > progress && styles.stepSegmentMuted]}
              />
            ))}
          </View>
        ) : null}
      </View>
      <Text style={[styles.title, !onBack && styles.titleLeft]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, !onBack && styles.subtitleLeft]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Text style={styles.primaryArrow}>›</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function Field({
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
}: {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <TextInput
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      style={styles.input}
    />
  );
}

function FixedRows({
  rows,
  setRows,
  placeholders,
  addLabel,
}: {
  rows: FixedRow[];
  setRows: (rows: FixedRow[]) => void;
  placeholders: string[];
  addLabel: string;
}) {
  const updateRow = (id: string, key: 'name' | 'amount', value: string) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  };

  return (
    <View style={styles.formStack}>
      {rows.map((row, index) => (
        <Card key={row.id} style={styles.rowCard}>
          <Field
            placeholder={placeholders[index] ?? placeholders[0]}
            value={row.name}
            onChangeText={(value) => updateRow(row.id, 'name', value)}
          />
          <Field
            placeholder="0 TL"
            value={row.amount}
            onChangeText={(value) => updateRow(row.id, 'amount', value)}
            keyboardType="numeric"
          />
        </Card>
      ))}
      <SecondaryButton
        label={addLabel}
        onPress={() => setRows([...rows, { id: `row-${Date.now()}`, name: '', amount: '' }])}
      />
    </View>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statLine}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.summaryPill}>
      <Text style={styles.summaryPillLabel}>{label}</Text>
      <Text style={styles.summaryPillValue}>{value}</Text>
    </Card>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${clamp(value, 0, 100)}%` }]} />
    </View>
  );
}

function roundSavingsValue(value: number, max: number) {
  const step = max <= 5000 ? 50 : 100;
  return clamp(Math.round(value / step) * step, 0, max);
}

function SegmentedControl<T extends string>({
  values,
  selected,
  onChange,
}: {
  values: readonly T[];
  selected: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {values.map((item) => (
        <Pressable
          key={item}
          onPress={() => onChange(item)}
          style={[styles.segmentOption, selected === item && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, selected === item && styles.segmentTextActive]}>
            {item}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SavingsSlider({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackPageXRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const thumbSize = 28;
  const safeMax = Math.max(max, 1);
  const ratio = clamp(value / safeMax, 0, 1);
  const thumbOffset =
    trackWidth > thumbSize ? clamp(ratio * trackWidth - thumbSize / 2, 0, trackWidth - thumbSize) : 0;

  const updateFromPosition = (positionX: number) => {
    if (!trackWidth) return;

    const bounded = clamp(positionX, 0, trackWidth);
    const nextRatio = bounded / trackWidth;
    onChange(roundSavingsValue(nextRatio * max, max));
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const beginDrag = (pageX: number) => {
    if (!trackWidth) return;
    const thumbCenter = ratio * trackWidth;
    const touchX = pageX - trackPageXRef.current;
    dragOffsetRef.current = touchX - thumbCenter;
    updateFromPosition(touchX - dragOffsetRef.current);
  };

  const moveDrag = (pageX: number) => {
    if (!trackWidth) return;
    const touchX = pageX - trackPageXRef.current;
    updateFromPosition(touchX - dragOffsetRef.current);
  };

  return (
    <View style={styles.targetSliderWrap}>
      <View style={styles.targetSliderLabels}>
        <Text style={styles.targetSliderEdge}>0 TL</Text>
        <Text style={styles.targetSliderEdge}>{money(max)}</Text>
      </View>
      <View
        onLayout={handleLayout}
        onStartShouldSetResponderCapture={() => true}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          trackPageXRef.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
          beginDrag(event.nativeEvent.pageX);
        }}
        onResponderMove={(event) => moveDrag(event.nativeEvent.pageX)}
        style={styles.targetSliderTrack}
      >
        <View style={styles.targetSliderBase} />
        <View style={[styles.targetSliderFill, { width: `${ratio * 100}%` }]} />
        <View style={[styles.targetSliderThumb, { left: thumbOffset }]} />
      </View>
    </View>
  );
}

function MicGlyph() {
  return (
    <View style={styles.micGlyph}>
      <View style={styles.micGlyphCapsule} />
      <View style={styles.micGlyphStem} />
      <View style={styles.micGlyphBase} />
    </View>
  );
}

function CartGlyph() {
  return (
    <View style={styles.cartGlyph}>
      <View style={styles.cartGlyphHandle} />
      <View style={styles.cartGlyphBasket}>
        <View style={styles.cartGlyphLineVertical} />
        <View style={styles.cartGlyphLineHorizontal} />
      </View>
      <View style={styles.cartGlyphWheels}>
        <View style={styles.cartGlyphWheel} />
        <View style={styles.cartGlyphWheel} />
      </View>
    </View>
  );
}

function EntryListItem({ entry, period }: { entry: MoneyEntry; period: Period }) {
  const glyph =
    entry.category === 'food'
      ? '◫'
      : entry.category === 'transport'
        ? '⊖'
        : entry.category === 'education'
          ? '◨'
          : entry.category === 'shopping'
            ? '⌂'
            : entry.category === 'bill'
              ? '◪'
              : '⌂';

  return (
    <View style={styles.entryRow}>
      <View style={styles.entryIcon}>
        <Text style={styles.entryIconText}>{glyph}</Text>
      </View>
      <View style={styles.entryTitleCell}>
        <Text numberOfLines={1} style={styles.entryTitle}>
          {entry.title}
        </Text>
      </View>
      <View style={styles.entryDateCell}>
        <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.entrySub}>
          {formatEntryDate(entry.date, period)}
        </Text>
      </View>
      <View style={styles.entryAmountCell}>
        <Text style={styles.entryAmount}>{money(entry.amount)}</Text>
      </View>
    </View>
  );
}

function SwipeMoneyRow({
  row,
  index,
  labels,
  onDelete,
  onChange,
}: {
  row: FixedRow;
  index: number;
  labels: string[];
  onDelete: () => void;
  onChange: (key: 'name' | 'amount', value: string) => void;
}) {
  return (
    <Swipeable
      containerStyle={styles.incomeSwipeWrap}
      friction={1.4}
      leftThreshold={34}
      overshootLeft={false}
      renderLeftActions={() => (
        <Pressable accessibilityRole="button" onPress={onDelete} style={styles.incomeDeleteButton}>
          <Text style={styles.incomeDeleteText}>Sil</Text>
        </Pressable>
      )}
    >
      <View style={styles.incomeRow}>
        <View style={styles.incomeIconCircle}>
          <Text style={styles.incomeIconText}>⌑</Text>
        </View>
        <TextInput
          placeholder={labels[index] ?? 'Ad'}
          placeholderTextColor="#6F7775"
          value={row.name}
          onChangeText={(value) => onChange('name', value)}
          style={styles.incomeNameInput}
        />
        <View style={styles.incomeAmountCell}>
          <TextInput
            placeholder="0"
            placeholderTextColor="#2B3330"
            value={row.amount}
            onChangeText={(value) => onChange('amount', value)}
            keyboardType="numeric"
            maxLength={12}
            style={styles.incomeAmountInput}
          />
          <Text style={styles.incomeCurrency}>TL</Text>
        </View>
      </View>
    </Swipeable>
  );
}

export default function App() {
  const [step, setStep] = useState<SetupStep>('welcome');
  const [name, setName] = useState('');
  const [incomeRows, setIncomeRows] = useState(() => makeRows('income', incomePlaceholders));
  const [expenseRows, setExpenseRows] = useState(() => makeRows('expense', expensePlaceholders));
  const [selectedSavings, setSelectedSavings] = useState(0);
  const [entries, setEntries] = useState<MoneyEntry[]>([]);
  const [period, setPeriod] = useState<Period>('Günlük');
  const [transcript, setTranscript] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [pendingVoice, setPendingVoice] = useState<ParsedVoice | null>(null);
  const [manualVoice, setManualVoice] = useState('');
  const [voiceInputMode, setVoiceInputMode] = useState<'mic' | 'keyboard'>('mic');
  const [extraType, setExtraType] = useState<EntryType>('income');
  const [extraTitle, setExtraTitle] = useState('');
  const [extraAmount, setExtraAmount] = useState('');

  useSpeechRecognitionEvent('start', () => {
    setRecognizing(true);
    setVoiceError('');
  });

  useSpeechRecognitionEvent('end', () => {
    setRecognizing(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const nextTranscript = event.results[0]?.transcript?.trim() ?? '';
    if (!nextTranscript) return;

    setTranscript(nextTranscript);

    if (!event.isFinal) return;

    const parsed = parseVoiceInput(nextTranscript);
    if (!parsed) {
      setVoiceError('Sesi çözdüm ama tutarı ayıramadım. Örn: Market 120 TL');
      return;
    }

    setPendingVoice(parsed);
    setManualVoice(parsed.transcript);
    setStep('confirm');
  });

  useSpeechRecognitionEvent('error', (event) => {
    setRecognizing(false);
    setVoiceError(
      event.error === 'not-allowed'
        ? 'Mikrofon izni verilmedi.'
        : 'Sesli kayıt tamamlanamadı. İstersen klavyeyle girebilirsin.',
    );
  });

  const totals = useMemo(() => {
    const fixedIncome = incomeRows.reduce((sum, row) => sum + parseAmount(row.amount), 0);
    const fixedExpense = expenseRows.reduce((sum, row) => sum + parseAmount(row.amount), 0);
    const monthlyRemaining = Math.max(0, fixedIncome - fixedExpense);
    const savingsGoal = clamp(selectedSavings, 0, monthlyRemaining);
    const monthlySafeSpend = Math.max(0, monthlyRemaining - savingsGoal);
    const extraIncome = entries
      .filter((entry) => entry.type === 'income')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const extraExpense = entries
      .filter((entry) => entry.type === 'expense')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const adjustedSafeSpend = Math.max(0, monthlySafeSpend + extraIncome);
    const remainingSafe = adjustedSafeSpend - extraExpense;
    const overspend = Math.max(0, extraExpense - adjustedSafeSpend);
    const protectedSavings = Math.max(0, savingsGoal - overspend);
    const spendRatio =
      adjustedSafeSpend <= 0 ? 0 : clamp((extraExpense / adjustedSafeSpend) * 100, 0, 100);

    return {
      fixedIncome,
      fixedExpense,
      monthlyRemaining,
      savingsGoal,
      monthlySafeSpend,
      weeklySafeSpend: monthlySafeSpend / 4,
      dailySafeSpend: monthlySafeSpend / 30,
      extraIncome,
      extraExpense,
      spent: extraExpense,
      remainingSafe,
      protectedSavings,
      spendRatio,
    };
  }, [incomeRows, expenseRows, selectedSavings, entries]);

  const now = new Date();
  const visibleEntries = entries.filter((entry) => {
    if (entry.type !== 'expense') return false;

    if (period === 'Aylık') {
      return (
        entry.date.getMonth() === now.getMonth() && entry.date.getFullYear() === now.getFullYear()
      );
    }

    if (period === 'Haftalık') {
      const daysFromMonday = (now.getDay() + 6) % 7;
      const startOfWeek = new Date(now);
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(now.getDate() - daysFromMonday);
      return entry.date >= startOfWeek;
    }

    return entry.date.toDateString() === now.toDateString();
  });

  const dashboardSpent = totals.spent;
  const dashboardRemaining = Math.max(0, totals.remainingSafe);
  const dashboardRatio = totals.spendRatio;
  const periodSpent = visibleEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const spendTitle =
    period === 'Günlük'
      ? 'Bugünkü harcamalar'
      : period === 'Haftalık'
        ? 'Bu haftaki harcamalar'
        : 'Bu ayki harcamalar';

  const choosePercent = (percent: number) => {
    setSelectedSavings(Math.round(totals.monthlyRemaining * percent));
  };

  const startListening = async () => {
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    setVoiceInputMode('mic');
    setTranscript('');
    setPendingVoice(null);
    setVoiceError('');

    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setVoiceError('Mikrofon izni olmadan sesli kayıt başlatılamıyor.');
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: 'tr-TR',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        contextualStrings: [
          'market',
          'kahve',
          'otobüs',
          'kitap',
          'kira',
          'fatura',
          'maaş',
          'prim',
          'ek gelir',
          'gider',
          'gelir',
        ],
      });
    } catch {
      setRecognizing(false);
      setVoiceError('Sesli kayıt başlatılamadı. İstersen klavyeyle girebilirsin.');
    }
  };

  const saveVoiceEntry = () => {
    if (!pendingVoice) return;
    setEntries((current) => [
      {
        id: `entry-${Date.now()}`,
        type: pendingVoice.type,
        category: pendingVoice.category,
        title: pendingVoice.title,
        amount: pendingVoice.amount,
        date: pendingVoice.date,
        source: 'voice',
      },
      ...current,
    ]);
    setPendingVoice(null);
    setManualVoice('');
    setTranscript('');
    setVoiceError('');
    setVoiceInputMode('mic');
    setStep('dashboard');
  };

  const saveManualVoice = () => {
    const parsed = parseVoiceInput(manualVoice);
    if (parsed) {
      setVoiceError('');
      setTranscript(parsed.transcript);
      setPendingVoice(parsed);
      setStep('confirm');
    } else {
      setVoiceError('Tutarı anlayamadım. Örn: Market 120 TL');
    }
  };

  const saveExtraEntry = () => {
    const amount = parseAmount(extraAmount);
    if (!amount) return;
    const title = extraTitle.trim() || (extraType === 'income' ? 'Ekstra Gelir' : 'Ekstra Gider');
    setEntries((current) => [
      {
        id: `extra-${Date.now()}`,
        type: extraType,
        category: inferEntryCategory(title, extraType),
        title,
        amount,
        date: new Date(),
        source: 'manual',
      },
      ...current,
    ]);
    setExtraTitle('');
    setExtraAmount('');
    setStep('dashboard');
  };

  const renderContent = () => {
    if (step === 'welcome') {
      return (
        <View style={styles.welcomeScreen}>
          <View style={styles.welcomeHero}>
            <Image source={welcomeLogoHero} style={styles.welcomeHeroImage} resizeMode="contain" />
            <Text style={styles.welcomeBrandName}>BİRİKİM YAP</Text>
          </View>
          <Text style={styles.welcomeTitle}>Hoş geldin!</Text>
          <Text style={styles.welcomeSubtitle}>Sana özel birikim planı{'\n'}oluşturalım.</Text>
          <View style={styles.welcomeInputWrap}>
            <Text style={styles.welcomeInputIcon}>♙</Text>
            <TextInput
              placeholder="İsmin veya takma adın"
              placeholderTextColor="#7F887A"
              value={name}
              onChangeText={setName}
              style={styles.welcomeInput}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!name.trim()}
            onPress={() => {
              setIncomeRows(makeRows('income', incomePlaceholders));
              setStep('income');
            }}
            style={({ pressed }) => [
              styles.welcomeButton,
              !name.trim() && styles.disabledButton,
              pressed && name.trim() && styles.pressed,
            ]}
          >
            <Text style={styles.welcomeButtonText}>Devam Et</Text>
            <Text style={styles.welcomeButtonArrow}>›</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 'income') {
      const updateIncomeRow = (id: string, key: 'name' | 'amount', value: string) => {
        setIncomeRows(
          incomeRows.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
        );
      };

      return (
        <View style={styles.incomeScreen}>
          <View style={styles.incomeTop}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('welcome')}
              style={styles.incomeBackButton}
            >
              <Text style={styles.incomeBackText}>‹</Text>
            </Pressable>
            <View style={styles.incomeProgress}>
              <View style={styles.incomeProgressActive} />
              <View style={styles.incomeProgressMuted} />
              <View style={styles.incomeProgressMuted} />
            </View>
          </View>

          <Text style={styles.incomeTitle}>Aylık sabit gelirlerin</Text>
          <Text style={styles.incomeSubtitle}>
            Her ay düzenli olarak kazandığın{'\n'}gelirleri ekle.
          </Text>

          <ScrollView
            style={styles.incomeRowsScroll}
            contentContainerStyle={styles.incomeList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {incomeRows.map((row, index) => (
              <SwipeMoneyRow
                key={row.id}
                row={row}
                index={index}
                labels={incomeDefaultLabels}
                onDelete={() => {
                  setIncomeRows(incomeRows.filter((item) => item.id !== row.id));
                }}
                onChange={(key, value) => updateIncomeRow(row.id, key, value)}
              />
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setIncomeRows([...incomeRows, { id: `row-${Date.now()}`, name: '', amount: '' }])
            }
            style={styles.incomeAddButton}
          >
            <View style={styles.incomeAddIconCircle}>
              <Text style={styles.incomeAddIcon}>+</Text>
            </View>
            <Text style={styles.incomeAddText}>Başka gelir ekle</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('expense')}
            style={({ pressed }) => [styles.incomeContinueButton, pressed && styles.pressed]}
          >
            <Text style={styles.incomeContinueText}>Devam Et</Text>
            <Text style={styles.incomeContinueArrow}>›</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 'expense') {
      const updateExpenseRow = (id: string, key: 'name' | 'amount', value: string) => {
        setExpenseRows(
          expenseRows.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
        );
      };
      const expenseDefaultLabels = ['Kira', 'Fatura', 'Market'];

      return (
        <View style={styles.incomeScreen}>
          <View style={styles.incomeTop}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('income')}
              style={styles.incomeBackButton}
            >
              <Text style={styles.incomeBackText}>‹</Text>
            </Pressable>
            <View style={styles.incomeProgress}>
              <View style={styles.incomeProgressActive} />
              <View style={styles.incomeProgressActive} />
              <View style={styles.incomeProgressMuted} />
            </View>
          </View>

          <Text style={styles.incomeTitle}>Aylık sabit giderlerin</Text>
          <Text style={styles.incomeSubtitle}>
            Her ay düzenli olarak yaptığın{'\n'}giderleri ekle.
          </Text>

          <ScrollView
            style={styles.incomeRowsScroll}
            contentContainerStyle={styles.incomeList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {expenseRows.map((row, index) => (
              <SwipeMoneyRow
                key={row.id}
                row={row}
                index={index}
                labels={expenseDefaultLabels}
                onDelete={() => {
                  setExpenseRows(expenseRows.filter((item) => item.id !== row.id));
                }}
                onChange={(key, value) => updateExpenseRow(row.id, key, value)}
              />
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setExpenseRows([...expenseRows, { id: `row-${Date.now()}`, name: '', amount: '' }])
            }
            style={styles.incomeAddButton}
          >
            <View style={styles.incomeAddIconCircle}>
              <Text style={styles.incomeAddIcon}>+</Text>
            </View>
            <Text style={styles.incomeAddText}>Başka gider ekle</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSelectedSavings(Math.round(totals.monthlyRemaining / 2));
              setStep('target');
            }}
            style={({ pressed }) => [styles.incomeContinueButton, pressed && styles.pressed]}
          >
            <Text style={styles.incomeContinueText}>Devam Et</Text>
            <Text style={styles.incomeContinueArrow}>›</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 'target') {
      return (
        <Screen>
          <View style={styles.targetTop}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('expense')}
              style={styles.targetBackButton}
            >
              <Text style={styles.targetBackText}>‹</Text>
            </Pressable>
            <View style={styles.targetProgress}>
              <View style={styles.targetProgressActive} />
              <View style={styles.targetProgressActive} />
              <View style={styles.targetProgressMuted} />
            </View>
          </View>

          <Text style={styles.targetTitle}>Birikimini belirle</Text>
          <Text style={styles.targetSubtitle}>Gelirlerini ve giderlerini hesapladık.</Text>
          <Text style={styles.targetSubtitle}>Ne kadar birikim yapmak istiyorsun?</Text>

          <View style={styles.targetSummaryCard}>
            <View style={styles.targetStatRow}>
              <View style={styles.targetStatLead}>
                <View style={[styles.targetStatIconCircle, styles.targetStatIncomeCircle]}>
                  <Text style={[styles.targetStatIcon, styles.targetStatIncomeIcon]}>▣</Text>
                </View>
                <Text style={styles.targetStatLabel}>Aylık toplam gelir</Text>
              </View>
              <Text style={[styles.targetStatAmount, styles.targetStatIncomeAmount]}>
                {money(totals.fixedIncome)}
              </Text>
            </View>
            <View style={styles.targetStatDivider} />
            <View style={styles.targetStatRow}>
              <View style={styles.targetStatLead}>
                <View style={[styles.targetStatIconCircle, styles.targetStatExpenseCircle]}>
                  <Text style={[styles.targetStatIcon, styles.targetStatExpenseIcon]}>▣</Text>
                </View>
                <Text style={styles.targetStatLabel}>Aylık toplam gider</Text>
              </View>
              <Text style={[styles.targetStatAmount, styles.targetStatExpenseAmount]}>
                {money(totals.fixedExpense)}
              </Text>
            </View>
            <View style={styles.targetStatDivider} />
            <View style={styles.targetStatRow}>
              <View style={styles.targetStatLead}>
                <View style={[styles.targetStatIconCircle, styles.targetStatRemainingCircle]}>
                  <Text style={[styles.targetStatIcon, styles.targetStatRemainingIcon]}>◫</Text>
                </View>
                <Text style={styles.targetStatLabel}>Artakalan para</Text>
              </View>
              <Text style={styles.targetStatAmount}>{money(totals.monthlyRemaining)}</Text>
            </View>
          </View>

          <View style={styles.targetAmountCard}>
            <Text style={styles.targetAmountLabel}>Birikime ayırmak istediğin tutar</Text>
            <Text style={styles.targetAmountValue}>{money(totals.savingsGoal)}</Text>

            <View style={styles.targetChipRow}>
              {[
                ['%25', 0.25],
                ['%50', 0.5],
                ['%75', 0.75],
                ['Tümü', 1],
              ].map(([label, percent]) => {
                const nextValue = roundSavingsValue(
                  totals.monthlyRemaining * (percent as number),
                  totals.monthlyRemaining,
                );
                const active = nextValue === totals.savingsGoal;

                return (
                  <Pressable
                    key={label as string}
                    onPress={() => setSelectedSavings(nextValue)}
                    style={({ pressed }) => [
                      styles.targetChip,
                      active && styles.targetChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.targetChipText, active && styles.targetChipTextActive]}>
                      {label as string}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <SavingsSlider
              value={totals.savingsGoal}
              max={totals.monthlyRemaining}
              onChange={setSelectedSavings}
            />
          </View>

          <Bottom>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('summary')}
              style={({ pressed }) => [styles.targetContinueButton, pressed && styles.pressed]}
            >
              <Text style={styles.targetContinueText}>Devam Et</Text>
              <Text style={styles.targetContinueArrow}>›</Text>
            </Pressable>
          </Bottom>
        </Screen>
      );
    }

    if (step === 'summary') {
      return (
        <Screen>
          <View style={styles.targetTop}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('target')}
              style={styles.targetBackButton}
            >
              <Text style={styles.targetBackText}>‹</Text>
            </Pressable>
            <View style={styles.targetProgress}>
              <View style={styles.targetProgressActive} />
              <View style={styles.targetProgressActive} />
              <View style={styles.targetProgressActive} />
            </View>
          </View>

          <Text style={styles.summaryTitle}>Planın hazır!</Text>
          <Text style={styles.summarySubtitle}>Hedefine ulaşman için önerdiğimiz</Text>
          <Text style={styles.summarySubtitle}>harcama limitlerin:</Text>

          <View style={styles.summaryLimitStack}>
            <View style={styles.summaryLimitCard}>
              <View style={styles.summaryLimitLead}>
                <View style={styles.summaryLimitIconCircle}>
                  <Text style={styles.summaryLimitIcon}>◫</Text>
                </View>
                <Text style={styles.summaryLimitLabel}>Aylık harcama limiti</Text>
              </View>
              <Text style={styles.summaryLimitValue}>{money(totals.monthlySafeSpend)}</Text>
            </View>

            <View style={styles.summaryLimitCard}>
              <View style={styles.summaryLimitLead}>
                <View style={styles.summaryLimitIconCircle}>
                  <Text style={styles.summaryLimitIcon}>◫</Text>
                </View>
                <Text style={styles.summaryLimitLabel}>Haftalık harcama limiti</Text>
              </View>
              <Text style={styles.summaryLimitValue}>{money(totals.weeklySafeSpend)}</Text>
            </View>

            <View style={styles.summaryLimitCard}>
              <View style={styles.summaryLimitLead}>
                <View style={styles.summaryLimitIconCircle}>
                  <Text style={styles.summaryLimitIcon}>◫</Text>
                </View>
                <Text style={styles.summaryLimitLabel}>Günlük harcama limiti</Text>
              </View>
              <Text style={styles.summaryLimitValue}>{money(totals.dailySafeSpend)}</Text>
            </View>
          </View>

          <View style={styles.summaryTipCard}>
            <View style={styles.summaryTipIconWrap}>
              <Text style={styles.summaryTipIcon}>☼</Text>
            </View>
            <Text style={styles.summaryTipText}>
              Bu planla her ay {money(totals.savingsGoal)} birikim yapabilirsin.
            </Text>
          </View>

          <Bottom>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('dashboard')}
              style={({ pressed }) => [styles.targetContinueButton, pressed && styles.pressed]}
            >
              <Text style={styles.targetContinueText}>Hedefi Onayla</Text>
              <Text style={styles.targetContinueArrow}>›</Text>
            </Pressable>
          </Bottom>
        </Screen>
      );
    }

    if (step === 'voice') {
      return (
        <Screen centered>
          <View style={styles.voiceHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                ExpoSpeechRecognitionModule.stop();
                setRecognizing(false);
                setStep('dashboard');
              }}
              style={styles.voiceBackButton}
            >
              <Text style={styles.voiceBackText}>‹</Text>
            </Pressable>
            <Text style={styles.voiceHeaderTitle}>Harcama Ekle</Text>
          </View>

          <View style={styles.voiceStage}>
            <View style={styles.voiceHaloOuter}>
              <View style={styles.voiceHaloMiddle}>
                <Pressable
                  accessibilityRole="button"
                  onPress={startListening}
                  style={[styles.voiceMicCore, recognizing && styles.voiceMicCoreActive]}
                >
                  <MicGlyph />
                </Pressable>
              </View>
            </View>

            <Text style={styles.voiceTitle}>{recognizing ? 'Dinliyorum...' : 'Harcamayı söyle'}</Text>
            <Text style={styles.voiceHelp}>"Örn: Market 120 TL"</Text>

            {transcript ? <Text style={styles.transcript}>{transcript}</Text> : null}
            {voiceError ? <Text style={styles.errorText}>{voiceError}</Text> : null}

            {voiceInputMode === 'keyboard' ? (
              <View style={styles.voiceManualPanel}>
                <TextInput
                  placeholder="Örn: Market 120 TL"
                  placeholderTextColor="#B0AEA7"
                  value={manualVoice}
                  onChangeText={setManualVoice}
                  style={styles.extraInput}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={saveManualVoice}
                  style={({ pressed }) => [
                    styles.voiceManualButton,
                    !manualVoice.trim() && styles.disabledButton,
                    pressed && manualVoice.trim() && styles.pressed,
                  ]}
                >
                  <Text style={styles.voiceManualButtonText}>Metni Çözümle</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.voiceFooter}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setVoiceInputMode('keyboard');
                setVoiceError('');
                setRecognizing(false);
                ExpoSpeechRecognitionModule.stop();
              }}
              style={({ pressed }) => [styles.voiceKeyboardButton, pressed && styles.pressed]}
            >
              <Text style={styles.voiceKeyboardText}>Klavye ile gir</Text>
            </Pressable>
          </View>
        </Screen>
      );
    }

    if (step === 'confirm' && pendingVoice) {
      return (
        <Screen>
          <View style={styles.voiceHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPendingVoice(null);
                setStep('voice');
              }}
              style={styles.voiceBackButton}
            >
              <Text style={styles.voiceBackText}>‹</Text>
            </Pressable>
            <Text style={styles.voiceHeaderTitle}>Harcama Ekle</Text>
          </View>

          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>Algıladım</Text>
            <View style={styles.confirmIcon}>
              <CartGlyph />
            </View>
            <Text style={styles.confirmTitle}>{pendingVoice.title}</Text>
            <Text style={styles.confirmAmount}>{money(pendingVoice.amount)}</Text>
            <Text style={styles.confirmDate}>
              Bugün,{' '}
              {pendingVoice.date.toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>

          <Bottom>
            <Pressable
              accessibilityRole="button"
              onPress={saveVoiceEntry}
              style={({ pressed }) => [styles.targetContinueButton, pressed && styles.pressed]}
            >
              <Text style={styles.targetContinueText}>Kaydet</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setPendingVoice(null);
                setStep('voice');
              }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>İptal</Text>
            </Pressable>
          </Bottom>
        </Screen>
      );
    }

    if (step === 'extra') {
      const canSaveExtra = parseAmount(extraAmount) > 0;

      return (
        <Screen>
          <View style={styles.voiceHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('dashboard')}
              style={styles.voiceBackButton}
            >
              <Text style={styles.voiceBackText}>‹</Text>
            </Pressable>
            <Text style={styles.voiceHeaderTitle}>Ekstra Gelir / Gider Ekle</Text>
          </View>

          <Text style={styles.extraPrompt}>Ne eklemek istiyorsun?</Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => setExtraType('income')}
            style={({ pressed }) => [
              styles.extraChoiceCard,
              extraType === 'income' && styles.extraChoiceCardActive,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.extraChoiceLead}>
              <View style={[styles.extraChoiceIconCircle, styles.extraChoiceIncomeCircle]}>
                <Text style={[styles.extraChoiceArrow, styles.extraChoiceIncomeArrow]}>↑</Text>
              </View>
              <Text style={styles.extraChoiceText}>Ekstra Gelir</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setExtraType('expense')}
            style={({ pressed }) => [
              styles.extraChoiceCard,
              extraType === 'expense' && styles.extraChoiceCardActive,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.extraChoiceLead}>
              <View style={[styles.extraChoiceIconCircle, styles.extraChoiceExpenseCircle]}>
                <Text style={[styles.extraChoiceArrow, styles.extraChoiceExpenseArrow]}>↓</Text>
              </View>
              <Text style={styles.extraChoiceText}>Ekstra Gider</Text>
            </View>
          </Pressable>

          <Text style={styles.extraFieldLabel}>
            Açıklama <Text style={styles.extraFieldLabelMuted}>(isteğe bağlı)</Text>
          </Text>
          <TextInput
            placeholder="Örn: Prim, ek iş, ani masraf..."
            placeholderTextColor="#B0AEA7"
            value={extraTitle}
            onChangeText={setExtraTitle}
            style={styles.extraInput}
          />

          <Text style={styles.extraFieldLabel}>Tutar</Text>
          <View style={styles.extraAmountInputWrap}>
            <TextInput
              placeholder="0"
              placeholderTextColor="#20312A"
              value={extraAmount}
              onChangeText={setExtraAmount}
              keyboardType="numeric"
              style={styles.extraAmountInput}
            />
            <Text style={styles.extraAmountCurrency}>TL</Text>
          </View>

          <Bottom>
            <Pressable
              accessibilityRole="button"
              disabled={!canSaveExtra}
              onPress={saveExtraEntry}
              style={({ pressed }) => [
                styles.targetContinueButton,
                !canSaveExtra && styles.disabledButton,
                pressed && canSaveExtra && styles.pressed,
              ]}
            >
              <Text style={styles.targetContinueText}>Kaydet</Text>
            </Pressable>
          </Bottom>
        </Screen>
      );
    }

    return (
      <Screen scroll={false}>
        <View style={styles.dashboardHeader}>
          <Text style={styles.dashboardAppName}>Birikim Yap</Text>
          <View style={styles.dashboardBell}>
            <Text style={styles.dashboardBellText}>◌</Text>
          </View>
        </View>

        <View style={styles.dashboardHeroCard}>
          <View style={styles.dashboardHeroTop}>
            <View style={styles.dashboardHeroCopy}>
              <Text style={styles.dashboardHeroLabel}>Aylık birikim hedefin</Text>
              <Text style={styles.dashboardHeroAmount}>{money(totals.savingsGoal)}</Text>
            </View>

            <View style={styles.dashboardRingWrap}>
              <View style={styles.dashboardRingTrack} />
              <View style={styles.dashboardRingArc} />
              <View style={styles.dashboardRingInner}>
                <Text style={styles.dashboardRingValue}>%{Math.round(dashboardRatio)}</Text>
                <Text style={styles.dashboardRingText}>hedefe sadık</Text>
                <Text style={styles.dashboardRingText}>kaldın</Text>
              </View>
            </View>
          </View>

          <View style={styles.dashboardStatRow}>
            <Text style={styles.dashboardStatLabel}>Biriktirmen gereken</Text>
            <Text style={styles.dashboardStatAccent}>{money(totals.savingsGoal)}</Text>
          </View>
          <View style={styles.dashboardStatRow}>
            <Text style={styles.dashboardStatLabel}>Bugüne kadar harcadığın</Text>
            <Text style={styles.dashboardStatAccent}>{money(dashboardSpent)}</Text>
          </View>
          <View style={styles.dashboardStatRow}>
            <Text style={styles.dashboardStatLabel}>Kalan harcama hakkın</Text>
            <Text style={styles.dashboardStatStrong}>{money(dashboardRemaining)}</Text>
          </View>
        </View>

        <View style={styles.dashboardTabs}>
          {(['Günlük', 'Haftalık', 'Aylık'] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setPeriod(item)}
              style={({ pressed }) => [
                styles.dashboardTab,
                period === item && styles.dashboardTabActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.dashboardTabText, period === item && styles.dashboardTabTextActive]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.dashboardSpendHeader}>
          <Text style={styles.dashboardSpendTitle}>{spendTitle}</Text>
          <Text style={styles.dashboardSpendTotal}>{money(periodSpent)}</Text>
        </View>
        <Text style={styles.dashboardSpendSub}>Toplam</Text>

        <View style={styles.dashboardListCard}>
          {visibleEntries.length > 0 ? (
            <View style={styles.dashboardTableHeader}>
              <Text style={[styles.dashboardTableHeaderText, styles.dashboardTableTitleHeader]}>
                Harcama
              </Text>
              <Text style={[styles.dashboardTableHeaderText, styles.dashboardTableDateHeader]}>
                Zaman
              </Text>
              <Text style={[styles.dashboardTableHeaderText, styles.dashboardTableAmountHeader]}>
                Tutar
              </Text>
            </View>
          ) : null}
          <ScrollView
            style={styles.dashboardEntryScroll}
            contentContainerStyle={styles.entryList}
            nestedScrollEnabled
            showsVerticalScrollIndicator={visibleEntries.length > 4}
          >
            {visibleEntries.length > 0 ? (
              visibleEntries.map((entry, index) => (
                <View key={entry.id}>
                  <EntryListItem entry={entry} period={period} />
                  {index < visibleEntries.length - 1 ? (
                    <View style={styles.dashboardEntryDivider} />
                  ) : null}
                </View>
              ))
            ) : (
              <View style={styles.emptyEntryState}>
                <Text style={styles.emptyEntryTitle}>Henüz harcama yok</Text>
                <Text style={styles.emptyEntryText}>Harcama ekledikçe bu liste dolacak.</Text>
              </View>
            )}
          </ScrollView>
        </View>

        <View style={styles.dashboardActionRow}>
          <Pressable
            style={({ pressed }) => [styles.dashboardActionButton, pressed && styles.pressed]}
            onPress={() => {
              setVoiceInputMode('mic');
              setManualVoice('');
              setTranscript('');
              setVoiceError('');
              setPendingVoice(null);
              setStep('voice');
            }}
          >
            <Text style={styles.dashboardActionIcon}>◔</Text>
            <Text style={styles.dashboardActionText}>Harcama Ekle</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.dashboardActionButton, pressed && styles.pressed]}
            onPress={() => setStep('extra')}
          >
            <Text style={styles.dashboardActionPlus}>+</Text>
            <Text style={styles.dashboardActionText}>Ekstra Gelir /</Text>
            <Text style={styles.dashboardActionText}>Gider Ekle</Text>
          </Pressable>
        </View>
      </Screen>
    );
  };

  return (
    <GestureHandlerRootView style={styles.safe}>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}
        >
          {renderContent()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function Screen({
  children,
  centered,
  scroll = true,
}: {
  children: ReactNode;
  centered?: boolean;
  scroll?: boolean;
}) {
  if (!scroll) {
    return <View style={[styles.screen, styles.fixedScreen, centered && styles.centeredScreen]}>{children}</View>;
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.screen, centered && styles.centeredScreen]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

function Bottom({ children }: { children: ReactNode }) {
  return <View style={styles.bottom}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboard: {
    flex: 1,
  },
  screen: {
    flexGrow: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: 4,
    paddingBottom: 18 + androidFooterClearance,
  },
  fixedScreen: {
    flex: 1,
    flexGrow: 0,
    minHeight: 0,
  },
  centeredScreen: {
    justifyContent: 'space-between',
  },
  header: {
    marginBottom: 12,
  },
  headerTop: {
    height: 32,
    justifyContent: 'center',
    marginBottom: 8,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
  },
  backSpace: {
    height: 32,
  },
  backText: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '300',
  },
  stepProgress: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
    top: 11,
  },
  stepSegment: {
    width: 30,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.green,
  },
  stepSegmentMuted: {
    backgroundColor: colors.greenSoft,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 24,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    maxWidth: 230,
    textAlign: 'center',
    alignSelf: 'center',
  },
  titleLeft: {
    textAlign: 'left',
    alignSelf: 'stretch',
    fontSize: 22,
    lineHeight: 27,
  },
  subtitleLeft: {
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius,
    padding: spacing.card,
    shadowColor: '#27331F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 1,
  },
  welcomeArt: {
    alignSelf: 'center',
    width: 106,
    height: 106,
    marginTop: 44,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 96,
    height: 96,
  },
  welcomeScreen: {
    flex: 1,
    backgroundColor: '#F8F6EF',
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 24 + androidFooterClearance,
    alignItems: 'center',
  },
  welcomeHero: {
    width: 190,
    height: 190,
    borderRadius: 0,
    overflow: 'visible',
    marginBottom: 10,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  welcomeHeroImage: {
    width: '100%',
    height: '100%',
  },
  welcomeBrandName: {
    position: 'absolute',
    bottom: 3,
    alignSelf: 'center',
    color: '#24392B',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: 5.4,
    textAlign: 'center',
  },
  welcomeImageSlot: {
    width: 142,
    height: 142,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  welcomePiggy: {
    width: 142,
    height: 142,
    marginBottom: 18,
  },
  welcomeLogoIcon: {
    width: 142,
    height: 142,
  },
  welcomeTitle: {
    color: '#1F352D',
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
    marginBottom: 10,
  },
  welcomeSubtitle: {
    color: '#747E72',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 250,
    marginBottom: 18,
  },
  welcomeInputWrap: {
    width: '100%',
    height: 46,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#DED7C9',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 19,
    marginBottom: 22,
    shadowColor: '#28321F',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
    elevation: 2,
  },
  welcomeInputIcon: {
    color: '#829E54',
    fontSize: 19,
    lineHeight: 21,
    marginRight: 14,
  },
  welcomeInput: {
    flex: 1,
    color: '#26372D',
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
  },
  welcomeButton: {
    width: '94%',
    height: 46,
    borderRadius: 17,
    backgroundColor: '#89A55B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C8245',
    shadowOffset: { width: 0, height: 13 },
    shadowOpacity: 0.23,
    shadowRadius: 19,
    elevation: 4,
  },
  welcomeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  welcomeButtonArrow: {
    position: 'absolute',
    right: 20,
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '400',
  },
  coinLarge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.greenSoft,
    borderWidth: 12,
    borderColor: colors.greenMist,
  },
  coinSmall: {
    position: 'absolute',
    right: 9,
    top: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.green,
    opacity: 0.9,
  },
  sprout: {
    position: 'absolute',
    color: colors.greenDark,
    fontSize: 36,
    fontWeight: '800',
  },
  input: {
    minHeight: 42,
    borderRadius: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 12,
    marginBottom: 8,
  },
  formStack: {
    gap: 10,
  },
  rowCard: {
    padding: 10,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 7,
    backgroundColor: colors.green,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: colors.greenDeep,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 2,
  },
  disabledButton: {
    opacity: 0.48,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  primaryArrow: {
    position: 'absolute',
    right: 15,
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '500',
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  secondaryButtonText: {
    color: colors.greenDark,
    fontSize: 12,
    fontWeight: '800',
  },
  bottom: {
    marginTop: 'auto',
    paddingTop: 20,
  },
  targetTop: {
    height: 24,
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  targetBackButton: {
    position: 'absolute',
    left: -2,
    width: 28,
    height: 28,
    justifyContent: 'center',
  },
  targetBackText: {
    color: '#20312A',
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '300',
  },
  targetProgress: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  targetProgressActive: {
    width: 34,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#8CA157',
  },
  targetProgressMuted: {
    width: 34,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E4E6E3',
  },
  targetTitle: {
    color: '#20312A',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  targetSubtitle: {
    color: '#98A09D',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  targetSummaryCard: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
    marginBottom: 10,
    shadowColor: '#70843C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
    elevation: 3,
  },
  targetStatRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  targetStatLead: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  targetStatIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetStatIncomeCircle: {
    backgroundColor: '#EFF4E3',
  },
  targetStatExpenseCircle: {
    backgroundColor: '#FDEBE3',
  },
  targetStatRemainingCircle: {
    backgroundColor: '#EFF4E3',
  },
  targetStatIcon: {
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '900',
  },
  targetStatIncomeIcon: {
    color: '#7D9554',
  },
  targetStatExpenseIcon: {
    color: '#F08A63',
  },
  targetStatRemainingIcon: {
    color: '#7D9554',
  },
  targetStatLabel: {
    color: '#9AA29F',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  targetStatAmount: {
    color: '#223027',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    textAlign: 'right',
  },
  targetStatIncomeAmount: {
    color: '#8AA45A',
  },
  targetStatExpenseAmount: {
    color: '#FA875E',
  },
  targetStatDivider: {
    height: 1,
    backgroundColor: '#EEF0EC',
  },
  targetAmountCard: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    shadowColor: '#70843C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
    elevation: 3,
  },
  targetAmountLabel: {
    color: '#8F9693',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  targetAmountValue: {
    color: '#20312A',
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 16,
  },
  targetChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  targetChip: {
    flex: 1,
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: '#F7F8F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetChipActive: {
    backgroundColor: '#EEF4E2',
  },
  targetChipText: {
    color: '#5F6663',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '800',
  },
  targetChipTextActive: {
    color: '#6E8346',
  },
  targetSliderWrap: {
    paddingTop: 2,
  },
  targetSliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  targetSliderEdge: {
    color: '#616865',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
  targetSliderTrack: {
    height: 28,
    justifyContent: 'center',
  },
  targetSliderBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E4E7E3',
  },
  targetSliderFill: {
    position: 'absolute',
    left: 0,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#8CA157',
  },
  targetSliderThumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#8CA157',
    borderWidth: 4,
    borderColor: '#A5B974',
    shadowColor: '#6A8040',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  targetContinueButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#9AB566',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#718544',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 3,
  },
  targetContinueText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },
  targetContinueArrow: {
    position: 'absolute',
    right: 18,
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '400',
  },
  summaryTitle: {
    color: '#20312A',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  summarySubtitle: {
    color: '#98A09D',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  summaryLimitStack: {
    gap: 8,
    marginTop: 18,
  },
  summaryLimitCard: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEF0EC',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryLimitLead: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryLimitIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EFF4E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLimitIcon: {
    color: '#7D9554',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '900',
  },
  summaryLimitLabel: {
    color: '#7E8682',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  summaryLimitValue: {
    color: '#20312A',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    textAlign: 'right',
  },
  summaryTipCard: {
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: '#FFFCF7',
    borderWidth: 1,
    borderColor: '#F2EBDD',
    marginTop: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  summaryTipIconWrap: {
    width: 28,
    alignItems: 'center',
  },
  summaryTipIcon: {
    color: '#F6A313',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '400',
  },
  summaryTipText: {
    flex: 1,
    color: '#7F8985',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  summaryCard: {
    marginBottom: 18,
  },
  statLine: {
    minHeight: 31,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  statValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  savingsBox: {
    gap: 12,
  },
  question: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  bigAmount: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 7,
  },
  chip: {
    flex: 1,
    minHeight: 29,
    borderRadius: 6,
    backgroundColor: colors.greenMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    color: colors.greenDark,
    fontSize: 10,
    fontWeight: '800',
  },
  limitGrid: {
    gap: 10,
  },
  summaryPill: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryPillLabel: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 0,
  },
  summaryPillValue: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  noteCard: {
    borderRadius: 9,
    backgroundColor: colors.surfaceWarm,
    padding: 13,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  noteIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteIconText: {
    color: colors.greenDark,
    fontSize: 13,
    fontWeight: '900',
  },
  noteCopy: {
    flex: 1,
  },
  noteTitle: {
    color: colors.greenDeep,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 5,
  },
  noteText: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 10,
  },
  appName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
  },
  greeting: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  headerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.greenMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: colors.greenDark,
    fontSize: 14,
    fontWeight: '900',
  },
  heroCard: {
    padding: 15,
    marginBottom: 13,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  heroCopy: {
    flex: 1,
  },
  heroLabel: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 4,
  },
  heroAmount: {
    color: colors.text,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
  },
  heroCaption: {
    color: colors.greenDark,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 5,
    fontWeight: '700',
  },
  ringWrap: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 7,
    borderColor: colors.green,
    backgroundColor: colors.greenMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    color: colors.greenDeep,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
  },
  ringLabel: {
    color: colors.muted,
    fontSize: 8,
    marginTop: 1,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.faint,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  heroStats: {
    borderRadius: 8,
    backgroundColor: colors.surfaceWarm,
    padding: 9,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceWarm,
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
    gap: 3,
  },
  segmentOption: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: '#2C3527',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: colors.text,
  },
  listCard: {
    marginBottom: 12,
    padding: 13,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 10,
  },
  listTitle: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  listSubtitle: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 2,
  },
  listTotal: {
    color: colors.greenDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  entryList: {
    gap: 0,
  },
  entryRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  entryIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F4F7EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  entryIconText: {
    color: '#7E8682',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '900',
  },
  entryTitleCell: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  entryTitle: {
    color: '#424C47',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },
  entryDateCell: {
    width: 96,
    minHeight: 26,
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#EEE9DE',
    paddingLeft: 8,
    paddingRight: 8,
  },
  entrySub: {
    color: '#A4A29B',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  entryAmountCell: {
    width: 74,
    minHeight: 26,
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#EEE9DE',
    paddingLeft: 9,
  },
  entryAmount: {
    color: '#20312A',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: colors.greenDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 3,
  },
  actionButtonLight: {
    flex: 1,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#27331F',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  actionPlus: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 25,
  },
  actionPlusMuted: {
    color: colors.greenDark,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 25,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  actionTextMuted: {
    color: colors.text,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  dashboardAppName: {
    color: '#20312A',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },
  dashboardBell: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardBellText: {
    color: '#20312A',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '400',
  },
  dashboardHeroCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 7,
    marginBottom: 8,
    shadowColor: '#70843C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 2,
  },
  dashboardHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dashboardHeroCopy: {
    flex: 1,
    paddingRight: 10,
  },
  dashboardHeroLabel: {
    color: '#7E8682',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  dashboardHeroAmount: {
    color: '#20312A',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
  },
  dashboardRingWrap: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardRingTrack: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 6,
    borderColor: '#EFECE4',
  },
  dashboardRingArc: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 6,
    borderLeftColor: 'transparent',
    borderTopColor: '#78924D',
    borderRightColor: '#78924D',
    borderBottomColor: '#78924D',
    transform: [{ rotate: '28deg' }],
  },
  dashboardRingInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardRingValue: {
    color: '#20312A',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    marginBottom: 2,
  },
  dashboardRingText: {
    color: '#4B564F',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
  },
  dashboardStatRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dashboardStatLabel: {
    color: '#7E8682',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  dashboardStatAccent: {
    color: '#8AA45A',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  dashboardStatStrong: {
    color: '#20312A',
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  dashboardTabs: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  dashboardTab: {
    flex: 1,
    minHeight: 32,
    borderRadius: 13,
    backgroundColor: '#FBF7EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardTabActive: {
    backgroundColor: '#8CA157',
  },
  dashboardTabText: {
    color: '#6C736E',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },
  dashboardTabTextActive: {
    color: '#FFFFFF',
  },
  dashboardSpendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  dashboardSpendTitle: {
    color: '#20312A',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
  },
  dashboardSpendTotal: {
    color: '#78924D',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },
  dashboardSpendSub: {
    color: '#B4B2AA',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  dashboardListCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE6DA',
    paddingHorizontal: 10,
    paddingVertical: 0,
    marginBottom: 8,
    shadowColor: '#70843C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.045,
    shadowRadius: 12,
    elevation: 1,
    overflow: 'hidden',
  },
  dashboardTableHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E9E2D5',
  },
  dashboardTableHeaderText: {
    color: '#A29A8B',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dashboardTableTitleHeader: {
    flex: 1,
    paddingLeft: 33,
  },
  dashboardTableDateHeader: {
    width: 96,
    textAlign: 'right',
    paddingRight: 8,
  },
  dashboardTableAmountHeader: {
    width: 74,
    textAlign: 'right',
  },
  dashboardEntryScroll: {
    flex: 1,
  },
  dashboardEntryDivider: {
    height: 1,
    backgroundColor: '#EEE9DE',
  },
  emptyEntryState: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  emptyEntryTitle: {
    color: '#424C47',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    marginBottom: 2,
  },
  emptyEntryText: {
    color: '#9B9A91',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  dashboardActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dashboardActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    shadowColor: '#27331F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  dashboardActionIcon: {
    color: '#8CA157',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '900',
  },
  dashboardActionPlus: {
    color: '#8CA157',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '900',
  },
  dashboardActionText: {
    color: '#3F4945',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 2,
  },
  voiceHeader: {
    height: 28,
    justifyContent: 'center',
    marginTop: 0,
    marginBottom: 32,
  },
  voiceBackButton: {
    position: 'absolute',
    left: -2,
    width: 28,
    height: 28,
    justifyContent: 'center',
  },
  voiceBackText: {
    color: '#20312A',
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '300',
  },
  voiceHeaderTitle: {
    color: '#20312A',
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  voiceStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 28,
  },
  voiceHaloOuter: {
    width: 158,
    height: 158,
    borderRadius: 79,
    backgroundColor: '#FBFBF7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  voiceHaloMiddle: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#E4ECCA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceMicCore: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#93AB57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceMicCoreActive: {
    backgroundColor: '#819949',
  },
  micGlyph: {
    width: 34,
    height: 42,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  micGlyphCapsule: {
    width: 16,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  micGlyphStem: {
    width: 3,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    marginTop: 2,
  },
  micGlyphBase: {
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    marginTop: 2,
  },
  voiceTitle: {
    color: '#20312A',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    marginBottom: 6,
  },
  voiceHelp: {
    color: '#808784',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  transcript: {
    color: '#20312A',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: 'center',
  },
  errorText: {
    color: colors.red,
    backgroundColor: colors.redSoft,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 12,
    overflow: 'hidden',
  },
  voiceFooter: {
    marginTop: 'auto',
  },
  voiceManualPanel: {
    width: '100%',
    marginTop: 14,
    gap: 10,
  },
  voiceManualButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#93AB57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceManualButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
  },
  voiceKeyboardButton: {
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE6DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceKeyboardText: {
    color: '#20312A',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
  },
  manualVoice: {
    marginTop: 18,
  },
  cartGlyph: {
    width: 40,
    height: 38,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  cartGlyphHandle: {
    position: 'absolute',
    top: 4,
    left: 8,
    width: 10,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#7A934E',
    transform: [{ rotate: '18deg' }],
  },
  cartGlyphBasket: {
    marginTop: 8,
    width: 22,
    height: 14,
    borderWidth: 3,
    borderColor: '#7A934E',
    borderTopWidth: 3,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartGlyphLineVertical: {
    position: 'absolute',
    width: 2,
    height: 8,
    backgroundColor: '#7A934E',
  },
  cartGlyphLineHorizontal: {
    position: 'absolute',
    width: 10,
    height: 2,
    backgroundColor: '#7A934E',
  },
  cartGlyphWheels: {
    width: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cartGlyphWheel: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: '#7A934E',
  },
  confirmCard: {
    minHeight: 240,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginTop: 6,
    shadowColor: '#70843C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  confirmIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F4F8EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  confirmLabel: {
    color: '#89A256',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    marginBottom: 18,
  },
  confirmTitle: {
    color: '#20312A',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    marginBottom: 6,
  },
  confirmAmount: {
    color: '#20312A',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    marginBottom: 24,
  },
  confirmDate: {
    color: '#8E9592',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  cancelButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  cancelText: {
    color: '#77807C',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    marginBottom: 12,
  },
  extraPrompt: {
    color: '#20312A',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 26,
  },
  extraChoiceCard: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0ECE4',
    paddingHorizontal: 16,
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#70843C',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  extraChoiceCardActive: {
    borderColor: '#DCE5C8',
    backgroundColor: '#FCFDF9',
  },
  extraChoiceLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  extraChoiceIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraChoiceIncomeCircle: {
    backgroundColor: '#F1F5E7',
  },
  extraChoiceExpenseCircle: {
    backgroundColor: '#FCEEE8',
  },
  extraChoiceArrow: {
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '900',
  },
  extraChoiceIncomeArrow: {
    color: '#89A256',
  },
  extraChoiceExpenseArrow: {
    color: '#F08A63',
  },
  extraChoiceText: {
    color: '#20312A',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
  },
  extraFieldLabel: {
    color: '#20312A',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
    marginTop: 22,
    marginBottom: 10,
  },
  extraFieldLabelMuted: {
    color: '#A8A6A0',
    fontWeight: '700',
  },
  extraInput: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFE9DE',
    paddingHorizontal: 14,
    color: '#20312A',
    fontSize: 14,
    lineHeight: 18,
  },
  extraAmountInputWrap: {
    minHeight: 56,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFE9DE',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  extraAmountInput: {
    flex: 1,
    color: '#20312A',
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'right',
    padding: 0,
  },
  extraAmountCurrency: {
    color: '#20312A',
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '800',
    marginLeft: 8,
  },
  extraCard: {
    padding: 10,
  },
  incomeScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 27,
    paddingTop: 24,
    paddingBottom: 18 + androidFooterClearance,
  },
  incomeScroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  incomeTop: {
    height: 18,
    marginBottom: 10,
    justifyContent: 'center',
  },
  incomeBackButton: {
    position: 'absolute',
    left: -2,
    width: 28,
    height: 28,
    justifyContent: 'center',
  },
  incomeBackText: {
    color: '#20312A',
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '300',
  },
  incomeProgress: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  incomeProgressActive: {
    width: 32,
    height: 4,
    borderRadius: 3,
    backgroundColor: '#789052',
  },
  incomeProgressMuted: {
    width: 32,
    height: 4,
    borderRadius: 3,
    backgroundColor: '#DFE2DD',
  },
  incomeTitle: {
    color: '#20312A',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  incomeSubtitle: {
    color: '#737D7A',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  incomeList: {
    gap: 0,
  },
  incomeRowsScroll: {
    height: 166,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECE6DA',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#2B3328',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 1,
  },
  incomeSwipeWrap: {
    height: 54,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  incomeDeleteButton: {
    width: 78,
    height: 54,
    borderRadius: 0,
    backgroundColor: '#D96A54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeDeleteText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  incomeRow: {
    height: 54,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 13,
    paddingRight: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE9DE',
    shadowOpacity: 0,
    elevation: 0,
    zIndex: 2,
  },
  incomeIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEF3E3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  incomeIconText: {
    color: '#87A35C',
    fontSize: 12,
    lineHeight: 13,
    fontWeight: '900',
  },
  incomeNameInput: {
    flex: 1,
    minWidth: 0,
    color: '#34413C',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    padding: 0,
    marginRight: 8,
  },
  incomeAmountCell: {
    width: 118,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderLeftWidth: 1,
    borderLeftColor: '#EEE9DE',
    paddingLeft: 10,
    paddingRight: 12,
  },
  incomeAmountInput: {
    flex: 1,
    minWidth: 0,
    color: '#2B3330',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    textAlign: 'right',
    padding: 0,
  },
  incomeCurrency: {
    color: '#6F7775',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginLeft: 6,
  },
  incomeAddButton: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#93A96B',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  incomeAddIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#7D9655',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  incomeAddIcon: {
    color: '#7D9655',
    fontSize: 13,
    lineHeight: 14,
    fontWeight: '900',
  },
  incomeAddText: {
    color: '#71884F',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  incomeContinueButton: {
    height: 40,
    borderRadius: 8,
    backgroundColor: '#8CA85D',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6D8247',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 13,
    elevation: 3,
  },
  incomeContinueText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  incomeContinueArrow: {
    position: 'absolute',
    right: 17,
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '400',
  },
});
