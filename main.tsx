import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { 
  Settings2, 
  Activity, 
  FlaskConical, 
  Info, 
  ChevronRight,
  RefreshCw,
  Layers,
  X,
  Plus,
  Box,
  LineChart as LineChartIcon
} from 'lucide-react';
import { motion } from 'motion/react';
import { calculatePRRoots, SUBSTANCES, getMixtureAB, PRParams } from './lib/eos';
import { cn } from './lib/utils';
import Plot3D from './components/Plot3D';

const R_GAS = 0.08206; // L*atm/(mol*K)
const ATM_TO_MPA = 0.101325;
const MPA_TO_ATM = 1 / ATM_TO_MPA;

const SUBSTANCE_NAMES: Record<keyof typeof SUBSTANCES, string> = {
  Methane: 'Метан',
  Ethane: 'Этан',
  Ethylene: 'Этилен',
  Propane: 'Пропан',
  Butane: 'Бутан',
  Pentane: 'Пентан',
  Hexane: 'Гексан',
  Heptane: 'Гептан',
  Octane: 'Октан',
  Nonane: 'Нонан',
  Decane: 'Декан',
  CO2: 'Углекислый газ (CO2)',
  H2S: 'Сероводород (H2S)',
  Nitrogen: 'Азот'
};

export default function App() {
  const [composition, setComposition] = useState<{id: keyof typeof SUBSTANCES, x: number}[]>([
    { id: 'Nitrogen', x: 0.173 },
    { id: 'Methane', x: 0.424 },
    { id: 'Ethylene', x: 0.402 }
  ]);
  const [temperature, setTemperature] = useState(200);
  const [pressure, setPressure] = useState(5);
  const [showMetastable, setShowMetastable] = useState(true);
  const [showHysteresis, setShowHysteresis] = useState(true);
  const [viewMode, setViewMode] = useState<'2d-p' | '2d-t' | '2d-pt' | '3d'>('2d-p');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const normalizeComposition = () => {
    const total = composition.reduce((s, c) => s + c.x, 0);
    if (total === 0 || Math.abs(total - 1) < 0.001) return;
    setComposition(composition.map(c => ({ ...c, x: parseFloat((c.x / total).toFixed(4)) })));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      const newComp: { id: keyof typeof SUBSTANCES, x: number }[] = [];
      for (const line of lines) {
        const parts = line.split(/[,;\t]/).map(p => p.trim());
        if (parts.length >= 2) {
          const id = parts[0] as keyof typeof SUBSTANCES;
          const x = parseFloat(parts[1]);
          if (SUBSTANCES[id] && !isNaN(x) && x > 0) {
            newComp.push({ id, x });
          }
        }
      }
      if (newComp.length > 0) setComposition(newComp);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const [pressureRange, setPressureRange] = useState({ min: 0.1, max: 30 }); // in MPa
  const [temperatureRange, setTemperatureRange] = useState({ min: 100, max: 500 }); // in K

  const updateComponent = (index: number, field: 'id' | 'x', value: any) => {
    const newComp = [...composition];
    newComp[index] = { ...newComp[index], [field]: value };
    setComposition(newComp);
  };

  const removeComponent = (index: number) => {
    setComposition(composition.filter((_, i) => i !== index));
  };

  const addComponent = () => {
    setComposition([...composition, { id: 'Methane', x: 0.1 }]);
  };

  const { a, b } = useMemo(() => {
    return getMixtureAB(composition, temperature, R_GAS);
  }, [temperature, composition]);

  const pseudoProps = useMemo(() => {
    const totalX = composition.reduce((sum, c) => sum + c.x, 0) || 1;
    let Tc = 0, Pc = 0, omega = 0;
    composition.forEach(c => {
      const x = c.x / totalX;
      const sub = SUBSTANCES[c.id];
      Tc += x * sub.Tc;
      Pc += x * sub.Pc;
      omega += x * sub.omega;
    });
    return { Tc, Pc, omega };
  }, [composition]);

  const { chartData, spinodalMin, spinodalMax } = useMemo(() => {
    const data = [];
    const steps = 150;
    const stepSize = (pressureRange.max - pressureRange.min) / steps;

    for (let i = 0; i <= steps; i++) {
      const P_MPa = pressureRange.min + i * stepSize;
      const P_atm = P_MPa * MPA_TO_ATM;
      const params: PRParams = { a, b, R: R_GAS, T: temperature };
      const result = calculatePRRoots(P_atm, params);

      data.push({
        P: parseFloat(P_MPa.toFixed(2)),
        Z_liquid: result.Z_liquid,
        Z_vapor: result.Z_vapor,
        Z_middle: result.Z_middle,
      });
    }

    const pointsWith3Roots = data.filter(d => d.Z_middle !== null);
    let sMin = null;
    let sMax = null;
    if (pointsWith3Roots.length > 0) {
      sMin = pointsWith3Roots[0];
      sMax = pointsWith3Roots[pointsWith3Roots.length - 1];
    }

    return { chartData: data, spinodalMin: sMin, spinodalMax: sMax };
  }, [a, b, temperature, pressureRange]);

  const { isobarData, isobarSpinodalMin, isobarSpinodalMax } = useMemo(() => {
    const data = [];
    const steps = 150;
    const stepSize = (temperatureRange.max - temperatureRange.min) / steps;

    for (let i = 0; i <= steps; i++) {
      const T = temperatureRange.min + i * stepSize;
      const { a: aT, b: bT } = getMixtureAB(composition, T, R_GAS);
      const params: PRParams = { a: aT, b: bT, R: R_GAS, T };
      const P_atm = pressure * MPA_TO_ATM;
      const result = calculatePRRoots(P_atm, params);

      data.push({
        T: parseFloat(T.toFixed(2)),
        Z_liquid: result.Z_liquid,
        Z_vapor: result.Z_vapor,
        Z_middle: result.Z_middle,
      });
    }

    const pointsWith3Roots = data.filter(d => d.Z_middle !== null);
    let sMin = null;
    let sMax = null;
    if (pointsWith3Roots.length > 0) {
      sMin = pointsWith3Roots[0];
      sMax = pointsWith3Roots[pointsWith3Roots.length - 1];
    }

    return { isobarData: data, isobarSpinodalMin: sMin, isobarSpinodalMax: sMax };
  }, [composition, pressure, temperatureRange]);

  const { ptData } = useMemo(() => {
    const data = [];
    const tSteps = 100;
    const tMin = temperatureRange.min;
    const tMax = Math.min(pseudoProps.Tc * 1.5, temperatureRange.max); // reasonable bounds
    const tStepSize = (tMax - tMin) / tSteps;

    // Evaluate spinodal boundaries across temperatures to approximate 2-phase region
    for (let i = 0; i <= tSteps; i++) {
      const T = tMin + i * tStepSize;
      const { a: aT, b: bT } = getMixtureAB(composition, T, R_GAS);
      const params: PRParams = { a: aT, b: bT, R: R_GAS, T };
      
      let pSpMin = null;
      let pSpMax = null;

      // Scan pressure quickly
      const pSteps = 100;
      const pStepSize = (pressureRange.max - 0.1) / pSteps;
      for (let j = 0; j <= pSteps; j++) {
        const pMPa = 0.1 + j * pStepSize;
        const result = calculatePRRoots(pMPa * MPA_TO_ATM, params);
        if (result.Z_middle !== null) {
          if (pSpMin === null) pSpMin = pMPa;
          pSpMax = pMPa;
        }
      }

      if (pSpMin !== null || pSpMax !== null) {
        data.push({
          T: parseFloat(T.toFixed(2)),
          P_SpMin: pSpMin,
          P_SpMax: pSpMax,
        });
      }
    }
    return { ptData: data };
  }, [composition, temperatureRange, pressureRange, pseudoProps.Tc]);

  const isSupercritical = temperature > pseudoProps.Tc;
  const sumX = composition.reduce((sum, c) => sum + c.x, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[--color-bg-secondary]">
      {/* Header */}
      <header className="bg-[--color-gaz-blue-700] px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-sm border border-white/20">
            <FlaskConical className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-white text-lg font-bold tracking-tight uppercase leading-tight">
              Инженерный портал: Изотермы смеси
            </h1>
            <p className="text-[10px] font-medium text-blue-100 uppercase tracking-widest opacity-80">
              Peng-Robinson EOS | Расчетный модуль
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-blue-900/40 p-1 rounded-sm border border-white/10">
            <button
              onClick={() => setViewMode('2d-p')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-bold transition-all uppercase tracking-wider",
                viewMode === '2d-p' ? "bg-white text-[--color-gaz-blue-700]" : "text-white hover:bg-white/10"
              )}
            >
              <span className="hidden sm:inline">Изотерма Z(P)</span>
            </button>
            <button
              onClick={() => setViewMode('2d-t')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-bold transition-all uppercase tracking-wider",
                viewMode === '2d-t' ? "bg-white text-[--color-gaz-blue-700]" : "text-white hover:bg-white/10"
              )}
            >
              <span className="hidden sm:inline">Изобара Z(T)</span>
            </button>
            <button
              onClick={() => setViewMode('2d-pt')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-bold transition-all uppercase tracking-wider",
                viewMode === '2d-pt' ? "bg-white text-[--color-gaz-blue-700]" : "text-white hover:bg-white/10"
              )}
            >
              <span className="hidden sm:inline">PT Диаграмма</span>
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-bold transition-all uppercase tracking-wider",
                viewMode === '3d' ? "bg-white text-[--color-gaz-blue-700]" : "text-white hover:bg-white/10"
              )}
            >
              <Box className="w-4 h-4" />
              <span className="hidden sm:inline">3D</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden p-6 gap-6">
        {/* Sidebar Controls */}
        <aside className="w-full lg:w-96 bg-white border border-[--color-border-secondary] overflow-y-auto p-6 space-y-6 rounded-sm">
          <section className="border-b border-[--color-border-secondary] pb-6">
            <div className="flex items-center gap-2 mb-6">
              <Settings2 className="w-4 h-4 text-[--color-gaz-blue-700]" />
              <h2 className="text-xs font-bold text-[--color-text-primary] uppercase tracking-widest">Параметры системы</h2>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-xs font-bold text-[--color-text-secondary] uppercase tracking-wider">
                    Компонентный состав
                  </label>
                </div>
                <div className="space-y-3">
                  {composition.map((comp, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select 
                        value={comp.id}
                        onChange={(e) => updateComponent(index, 'id', e.target.value)}
                        className="flex-1 bg-white border border-[--color-border-primary] rounded-sm px-3 py-2 text-sm focus:border-[--color-gaz-blue-700] outline-none transition-colors"
                      >
                        {Object.keys(SUBSTANCES).map(s => (
                          <option key={s} value={s}>{SUBSTANCE_NAMES[s as keyof typeof SUBSTANCES]}</option>
                        ))}
                      </select>
                      <input 
                        type="number" 
                        min="0" 
                        max="1" 
                        step="0.01"
                        value={comp.x}
                        onChange={(e) => updateComponent(index, 'x', parseFloat(e.target.value) || 0)}
                        className="w-20 bg-white border border-[--color-border-primary] rounded-sm px-3 py-2 text-sm font-mono focus:border-[--color-gaz-blue-700] outline-none"
                      />
                      <button 
                        onClick={() => removeComponent(index)}
                        disabled={composition.length === 1}
                        className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={addComponent}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-dashed border-[--color-border-primary] rounded-sm text-[10px] font-bold text-[--color-text-secondary] hover:border-[--color-gaz-blue-700] hover:text-[--color-gaz-blue-700] transition-all uppercase tracking-wider"
                    >
                      <Plus className="w-3 h-3" />
                      Добавить
                    </button>
                    <button 
                      onClick={normalizeComposition}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-[--color-border-primary] rounded-sm text-[10px] font-bold text-[--color-text-secondary] hover:border-[--color-gaz-blue-700] hover:text-[--color-gaz-blue-700] transition-all bg-slate-50 uppercase tracking-wider"
                      title="Нормализовать до 1.0"
                    >
                      Нормал. 1.0
                    </button>
                    <label className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-[--color-border-primary] rounded-sm text-[10px] font-bold text-[--color-text-secondary] hover:border-[--color-gaz-blue-700] hover:text-[--color-gaz-blue-700] transition-all bg-slate-50 uppercase tracking-wider cursor-pointer">
                      CSV
                      <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload}/>
                    </label>
                  </div>
                </div>

                {Math.abs(sumX - 1) > 0.01 && (
                  <p className="text-[10px] text-amber-600 font-bold mt-2 uppercase tracking-tight">
                    Внимание: Сумма долей ({sumX.toFixed(3)}) ≠ 1.0. Авто-нормализация активна.
                  </p>
                )}
              </div>

              <div className="pt-6 space-y-6 border-t border-[--color-border-secondary]">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-[--color-text-secondary] uppercase mb-2 block tracking-wider">
                      Т-точки (К)
                    </label>
                    <input 
                      type="number" 
                      min={100} 
                      max={temperatureRange.max} 
                      step="1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value) || 100)}
                      className="w-full px-3 py-2 bg-white border border-[--color-border-primary] rounded-sm text-sm font-mono focus:border-[--color-gaz-blue-700] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[--color-text-secondary] uppercase mb-2 block tracking-wider">
                      Р-точки (МПа)
                    </label>
                    <input 
                      type="number" 
                      min={0.1} 
                      max={pressureRange.max} 
                      step="0.1"
                      value={pressure}
                      onChange={(e) => setPressure(parseFloat(e.target.value) || 0.1)}
                      className="w-full px-3 py-2 bg-white border border-[--color-border-primary] rounded-sm text-sm font-mono focus:border-[--color-gaz-blue-700] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-[--color-text-secondary] uppercase mb-2 block tracking-wider">
                      Мин. Т 3D (К)
                    </label>
                    <input 
                      type="number" 
                      min={50} 
                      max={temperatureRange.max - 10} 
                      step="10"
                      value={temperatureRange.min}
                      onChange={(e) => setTemperatureRange({ ...temperatureRange, min: parseFloat(e.target.value) || 50 })}
                      className="w-full px-3 py-2 bg-white border border-[--color-border-primary] rounded-sm text-sm font-mono focus:border-[--color-gaz-blue-700] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[--color-text-secondary] uppercase mb-2 block tracking-wider">
                      Макс. Т 3D (К)
                    </label>
                    <input 
                      type="number" 
                      min={temperatureRange.min + 10} 
                      max={2000} 
                      step="10"
                      value={temperatureRange.max}
                      onChange={(e) => setTemperatureRange({ ...temperatureRange, max: parseFloat(e.target.value) || 200 })}
                      className="w-full px-3 py-2 bg-white border border-[--color-border-primary] rounded-sm text-sm font-mono focus:border-[--color-gaz-blue-700] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[--color-text-secondary] uppercase mb-2 block tracking-wider">
                    Предел Давления (МПа)
                  </label>
                  <input 
                    type="number" 
                    min={1} 
                    max={100} 
                    step="1"
                    value={pressureRange.max}
                    onChange={(e) => setPressureRange({ ...pressureRange, max: parseFloat(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-white border border-[--color-border-primary] rounded-sm text-sm font-mono focus:border-[--color-gaz-blue-700] outline-none"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-[--color-border-secondary] space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-[--color-text-secondary] uppercase tracking-wider">
                    Метастабильная петля
                  </label>
                  <button 
                    onClick={() => setShowMetastable(!showMetastable)}
                    className={cn(
                      "w-10 h-5 rounded-full relative transition-colors border",
                      showMetastable ? "bg-[--color-gaz-blue-700] border-[--color-gaz-blue-700]" : "bg-slate-200 border-slate-300"
                    )}
                  >
                    <motion.div 
                      animate={{ x: showMetastable ? 22 : 2 }}
                      className="absolute top-1 w-2.5 h-2.5 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-[--color-text-secondary] uppercase tracking-wider">
                    Гистерезис (линии)
                  </label>
                  <button 
                    onClick={() => setShowHysteresis(!showHysteresis)}
                    className={cn(
                      "w-10 h-5 rounded-full relative transition-colors border",
                      showHysteresis ? "bg-[--color-gaz-blue-700] border-[--color-gaz-blue-700]" : "bg-slate-200 border-slate-300"
                    )}
                  >
                    <motion.div 
                      animate={{ x: showHysteresis ? 22 : 2 }}
                      className="absolute top-1 w-2.5 h-2.5 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <footer className="pt-2">
            <div className="bg-[--color-bg-secondary] p-4 rounded-sm border border-[--color-border-secondary]">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-3 h-3 text-[--color-gaz-blue-700]" />
                <span className="text-[10px] font-bold text-[--color-text-primary] uppercase tracking-widest">Информация</span>
              </div>
              <p className="text-[10px] text-[--color-text-secondary] leading-relaxed">
                Расчет производится на основе уравнения состояния Пенга-Робинсона для многокомпонентных смесей с использованием правил смешения Ван-дер-Ваальса.
              </p>
            </div>
          </footer>
        </aside>

        {/* Chart Area */}
        <section className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-[--color-text-primary] uppercase tracking-widest mb-1 flex items-center gap-2">
                {viewMode === '2d-p' && 'Анализ Изотермы (Z-P)'}
                {viewMode === '2d-t' && 'Анализ Изобары (Z-T)'}
                {viewMode === '2d-pt' && 'Анализ 2-х фазной области (P-T)'}
                {viewMode === '3d' && '3D Анализ Состояния Z(T, P)'}
                <span className={cn(
                  "px-2 py-0.5 rounded-sm text-[8px] border font-bold uppercase",
                  isSupercritical 
                    ? "bg-amber-50 text-amber-700 border-amber-200" 
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                )}>
                  {isSupercritical ? 'Сверхкритическое' : 'Докритическое'}
                </span>
              </h3>
              <p className="text-xs text-[--color-text-secondary]">
                {viewMode === '2d-pt' 
                  ? 'Приближенная двухфазная область (между линиями спинодали)' 
                  : 'Коэффициент сжимаемости Z в зависимости от параметров среды'}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="block text-[10px] font-bold text-[--color-text-secondary] uppercase tracking-wider">Псевдо-крит. Т</span>
                <span className="text-sm font-mono font-bold text-[--color-text-primary]">{pseudoProps.Tc.toFixed(1)} K</span>
              </div>
              <div className="w-px h-8 bg-[--color-border-secondary]" />
              <div className="text-right">
                <span className="block text-[10px] font-bold text-[--color-text-secondary] uppercase tracking-wider">Псевдо-крит. P</span>
                <span className="text-sm font-mono font-bold text-[--color-text-primary]">{ (pseudoProps.Pc * ATM_TO_MPA).toFixed(2) } МПа</span>
              </div>
            </div>
          </div>

          {viewMode === '2d-p' && (
            <div className="bg-white p-6 rounded-sm border border-[--color-border-secondary] h-[500px] shadow-sm">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="P" 
                    type="number"
                    domain={[pressureRange.min, pressureRange.max]}
                    label={{ value: 'Давление (МПа)', position: 'bottom', offset: 0, fontSize: 11, fill: '#6b7280', fontWeight: 600 }}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                  />
                  <YAxis 
                    domain={[0, 1.2]}
                    label={{ value: 'Коэф. сжимаемости Z', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6b7280', fontWeight: 600 }}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '2px', border: '1px solid #d1d5db', boxShadow: 'none', padding: '12px' }}
                    itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                    labelStyle={{ fontSize: '11px', fontWeight: '700', color: '#1a1a1a', marginBottom: '8px' }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="plainline"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 600, color: '#1a1a1a' }}
                  />
                  <Line type="monotone" dataKey="Z_vapor" stroke="#005EB8" strokeWidth={3} dot={false} name="Пар" />
                  <Line type="monotone" dataKey="Z_liquid" stroke="#1a1a1a" strokeWidth={3} dot={false} name="Жидкость" />
                  {showMetastable && (
                    <Line type="monotone" dataKey="Z_middle" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Метастабильное" connectNulls={false} />
                  )}
                  {spinodalMin && (
                     <ReferenceLine x={spinodalMin.P} stroke="#000" strokeDasharray="2 2" label={{ position: 'top', value: 'SpL', fontSize: 9, fill: '#000' }} />
                  )}
                  {spinodalMax && (
                     <ReferenceLine x={spinodalMax.P} stroke="#000" strokeDasharray="2 2" label={{ position: 'top', value: 'SpV', fontSize: 9, fill: '#000' }} />
                  )}
                  <ReferenceLine x={pseudoProps.Pc * ATM_TO_MPA} stroke="#d1d5db" strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {viewMode === '2d-t' && (
            <div className="bg-white p-6 rounded-sm border border-[--color-border-secondary] h-[500px] shadow-sm">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={isobarData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="T" 
                    type="number"
                    domain={[temperatureRange.min, temperatureRange.max]}
                    label={{ value: 'Температура (К)', position: 'bottom', offset: 0, fontSize: 11, fill: '#6b7280', fontWeight: 600 }}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                  />
                  <YAxis 
                    domain={[0, 1.2]}
                    label={{ value: 'Коэф. сжимаемости Z', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6b7280', fontWeight: 600 }}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '2px', border: '1px solid #d1d5db', boxShadow: 'none', padding: '12px' }}
                    itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                    labelStyle={{ fontSize: '11px', fontWeight: '700', color: '#1a1a1a', marginBottom: '8px' }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="plainline"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 600, color: '#1a1a1a' }}
                  />
                  <Line type="monotone" dataKey="Z_vapor" stroke="#005EB8" strokeWidth={3} dot={false} name="Пар" />
                  <Line type="monotone" dataKey="Z_liquid" stroke="#1a1a1a" strokeWidth={3} dot={false} name="Жидкость" />
                  {showMetastable && (
                    <Line type="monotone" dataKey="Z_middle" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Метастабильное" connectNulls={false} />
                  )}
                  {isobarSpinodalMin && (
                     <ReferenceLine x={isobarSpinodalMin.T} stroke="#000" strokeDasharray="2 2" label={{ position: 'top', value: 'SpL', fontSize: 9, fill: '#000' }} />
                  )}
                  {isobarSpinodalMax && (
                     <ReferenceLine x={isobarSpinodalMax.T} stroke="#000" strokeDasharray="2 2" label={{ position: 'top', value: 'SpV', fontSize: 9, fill: '#000' }} />
                  )}
                  <ReferenceLine x={pseudoProps.Tc} stroke="#d1d5db" strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {viewMode === '2d-pt' && (
            <div className="bg-white p-6 rounded-sm border border-[--color-border-secondary] h-[500px] shadow-sm">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ptData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="T" 
                    type="number"
                    domain={['auto', 'auto']}
                    label={{ value: 'Температура (К)', position: 'bottom', offset: 0, fontSize: 11, fill: '#6b7280', fontWeight: 600 }}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                  />
                  <YAxis 
                    domain={[0, pressureRange.max]}
                    label={{ value: 'Давление (МПа)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6b7280', fontWeight: 600 }}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '2px', border: '1px solid #d1d5db', boxShadow: 'none', padding: '12px' }}
                    itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                    labelStyle={{ fontSize: '11px', fontWeight: '700', color: '#1a1a1a', marginBottom: '8px' }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="plainline"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 600, color: '#1a1a1a' }}
                  />
                  <Line type="monotone" dataKey="P_SpMin" stroke="#005EB8" strokeWidth={2} dot={false} name="Нижняя граница 2-ф обл." connectNulls={false} />
                  <Line type="monotone" dataKey="P_SpMax" stroke="#1a1a1a" strokeWidth={2} dot={false} name="Верхняя граница 2-ф обл." connectNulls={false} />
                  <ReferenceLine x={pseudoProps.Tc} stroke="#d1d5db" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Tc', fontSize: 9, fill: '#9ca3af' }}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {viewMode === '3d' && (
            <div className="flex-1 min-h-[500px]">
              <Plot3D 
                composition={composition} 
                pressureRange={pressureRange} 
                temperatureRange={temperatureRange}
                showMetastable={showMetastable}
                showHysteresis={showHysteresis}
                currentT={temperature}
                currentP={pressure}
              />
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[--color-bg-secondary] p-6 rounded-sm border border-[--color-border-secondary] flex items-start gap-4">
              <div className="p-3 bg-white border border-[--color-border-secondary] rounded-sm text-[--color-gaz-blue-700]">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[--color-text-primary] uppercase tracking-widest mb-2">Архитектура стабильности</h4>
                <p className="text-[11px] text-[--color-text-secondary] leading-relaxed">
                  Многофазные вычисления требуют высокой точности. Параметры Tc и Pc рассчитываются методом псевдокритических параметров по правилу Кейса.
                </p>
              </div>
            </div>
            <div className="bg-[--color-bg-secondary] p-6 rounded-sm border border-[--color-border-secondary] flex items-start gap-4">
              <div className="p-3 bg-white border border-[--color-border-secondary] rounded-sm text-[--color-gaz-blue-700]">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[--color-text-primary] uppercase tracking-widest mb-2">Анализ отклонений</h4>
                <p className="text-[11px] text-[--color-text-secondary] leading-relaxed">
                  Пунктирная линия обозначает метастабильные состояния, где решение кубического уравнения дает физически неустойчивые корни.
                </p>
              </div>
            </div>
            <div className="bg-[--color-bg-secondary] p-6 rounded-sm border border-[--color-border-secondary] flex items-start gap-4">
              <div className="p-3 bg-white border border-[--color-border-secondary] rounded-sm text-[--color-gaz-blue-700]">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[--color-text-primary] uppercase tracking-widest mb-2">3D Проектирование</h4>
                <p className="text-[11px] text-[--color-text-secondary] leading-relaxed">
                  Объемная модель позволяет визуализировать фазовые переходы во всем диапазоне рабочих температур и давлений.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

