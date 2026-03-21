
'use client';
import { CanvasSyncEditor } from '@/components/canvas-sync/main-editor';
import { I18nContext, type Locale } from '@/lib/i18n';
import { useState } from 'react';

const translations = {
  en: {
    menu: {
      file: 'File',
      edit: 'Edit',
      view: 'View',
      select: 'Select',
      canvas: 'Canvas',
      layer: 'Layer',
      paint: 'Paint',
      history: 'History',
      panel: 'Panel',
      settings: 'Settings',
    },
    file: {
        new: 'New',
        newProject: 'New Project',
        newFromTemplate: 'New from Template',
        open: 'Open...',
        openRecent: 'Open recent',
        noRecentProjects: 'No recent projects',
        save: 'Save',
        saveAs: 'Save as...',
        import: 'Import...',
        exportAsPng: 'Export as PNG...',
        openMostRecent: 'Open Most Recent',
        close: 'Close',
    },
    edit: {
        undo: 'Undo',
        redo: 'Redo',
        cut: 'Cut',
        copy: 'Copy',
        paste: 'Paste',
        adjust: 'Adjust',
        brightnessContrast: 'Brightness/Contrast',
        hueSaturation: 'Hue/Saturation',
        transform: 'Transform',
        scale: 'Scale',
        rotate: 'Rotate',
        fill: 'Fill',
        clear: 'Clear',
        crop: 'Crop',
    },
    view: {
        showGrid: 'Show grid',
        showRulers: 'Show rulers',
        showChannel: 'Show channel',
        flipHorizontal: 'Flip horizontal',
        flipVertical: 'Flip vertical',
        lockView: 'Lock view',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        rotateLeft: 'Rotate left',
        rotateRight: 'Rotate right',
        fullScreen: 'Full screen',
        toggleFullScreen: 'Toggle full screen',
    },
    select: {
        selectAllRect: 'Select all as rectangle',
        selectAllLasso: 'Select all as lasso',
        selectCanvasFrame: 'Select canvas frame',
        invertSelection: 'Invert selection',
        deselect: 'Deselect',
    },
    canvas: {
        frameSize: 'Canvas frame size...',
        useInfinite: 'Use infinite canvas',
        background: 'Canvas background...',
        unitResolution: 'Canvas unit & resolution...',
        clearCanvas: 'Clear canvas...',
    },
    layer: {
        newLayer: 'New layer above current',
        mergeDown: 'Merge layer with below',
        duplicate: 'Duplicate',
        delete: 'Delete',
        clear: 'Clear',
        selectAll: 'Select all layers',
        mergeAll: 'Merge all layers...',
    },
    paint: {
        resetAllBrushes: 'Reset all brushes...',
        smallerBrush: 'Smaller brush',
        biggerBrush: 'Bigger brush',
        defaultColors: 'Default colors',
        swapColors: 'Swap colors',
        darker: 'Darker',
        brighter: 'Brighter',
        grayer: 'Grayer',
        purer: 'Purer',
        cooler: 'Cooler',
        warmer: 'Warmer',
    },
    history: {
        newFromHistory: 'New from History',
        clearHistory: 'Clear history...',
        setHistoryLimit: 'Set history limit...',
    },
    panel: {
        showHide: 'Show/hide panels',
        showConsole: 'Show Console',
        showTool: 'Show Tool',
        showLine: 'Show Line',
        showBrushList: 'Show Brush list',
        showBrushOptions: 'Show Brush options',
        showColor: 'Show Color',
        showLayers: 'Show Layers',
        showSelect: 'Show Select',
        showView: 'Show View',
        showSidebar: 'Show Sidebar',
        showNumpad: 'Show Numpad',
        showExportbar: 'Show Exportbar',
        showPerformance: 'Show Performance',
        closeAll: 'Close all panels',
        toolTip: 'Click the tool icon in the toolbar or use keyboard shortcuts (e.g. B for Brush) to change tools.',
        brushTip: 'Click the brush icon in the toolbar to open the brush selection panel.',
        brushOptionsTip: 'Brush size and opacity sliders are available in the toolbar.',
        colorTip: 'Click the color wells in the toolbar to open the color picker.',
        layersTip: 'Click the Layers button in the toolbar to open the layers panel.',
        viewTip: 'Click the View button in the toolbar to open view options.',
        allPanels: 'All Panels',
        allPanelsTip: 'All panel popups are controlled from the toolbar.',
    },
    settings: {
        userInterface: 'User interface...',
        windowOpacity: 'Window opacity...',
        penMapping: 'Pen mapping...',
        penPressure: 'Pen pressure...',
        multiTouch: 'Multi-touch...',
        rightSideButton: 'Right/side button...',
        wheelDialScroller: 'Wheel/dial scroller...',
        language: 'Language...',
        leftHanded: 'Left handed',
        flipToolbar: 'Flip toolbar',
    },
    languageDialog: {
        description: 'Change the display language for the application user interface.',
    },
    common: {
        save: 'Save',
        cancel: 'Cancel',
    },
    notImplemented: {
        title: 'Feature not implemented',
        description: 'This feature is not yet available.',
    },
    noRecentProjects: {
        title: 'No recent projects',
        description: 'Save a project to see it here.',
    },
  },
  es: {
    menu: {
        file: 'Archivo',
        edit: 'Editar',
        view: 'Ver',
        select: 'Seleccionar',
        canvas: 'Lienzo',
        layer: 'Capa',
        paint: 'Pintar',
        history: 'Historial',
        panel: 'Panel',
        settings: 'Ajustes',
    },
    file: {
        new: 'Nuevo',
        newProject: 'Nuevo Proyecto',
        newFromTemplate: 'Nuevo desde Plantilla',
        open: 'Abrir...',
        openRecent: 'Abrir recientes',
        noRecentProjects: 'No hay proyectos recientes',
        save: 'Guardar',
        saveAs: 'Guardar como...',
        import: 'Importar...',
        exportAsPng: 'Exportar como PNG...',
        openMostRecent: 'Abrir más reciente',
        close: 'Cerrar',
    },
    edit: {
        undo: 'Deshacer',
        redo: 'Rehacer',
        cut: 'Cortar',
        copy: 'Copiar',
        paste: 'Pegar',
        adjust: 'Ajustar',
        brightnessContrast: 'Brillo/Contraste',
        hueSaturation: 'Tono/Saturación',
        transform: 'Transformar',
        scale: 'Escalar',
        rotate: 'Girar',
        fill: 'Rellenar',
        clear: 'Limpiar',
        crop: 'Recortar',
    },
    view: {
        showGrid: 'Mostrar cuadrícula',
        showRulers: 'Mostrar reglas',
        showChannel: 'Mostrar canal',
        flipHorizontal: 'Voltear horizontalmente',
        flipVertical: 'Voltear verticalmente',
        lockView: 'Bloquear vista',
        zoomIn: 'Acercar',
        zoomOut: 'Alejar',
        rotateLeft: 'Girar a la izquierda',
        rotateRight: 'Girar a la derecha',
        fullScreen: 'Pantalla completa',
        toggleFullScreen: 'Alternar pantalla completa',
    },
    select: {
        selectAllRect: 'Seleccionar todo como rectángulo',
        selectAllLasso: 'Seleccionar todo como lazo',
        selectCanvasFrame: 'Seleccionar marco del lienzo',
        invertSelection: 'Invertir selección',
        deselect: 'Deseleccionar',
    },
    canvas: {
        frameSize: 'Tamaño del marco del lienzo...',
        useInfinite: 'Usar lienzo infinito',
        background: 'Fondo del lienzo...',
        unitResolution: 'Unidad y resolución del lienzo...',
        clearCanvas: 'Limpiar lienzo...',
    },
    layer: {
        newLayer: 'Nueva capa sobre la actual',
        mergeDown: 'Combinar capa con la de abajo',
        duplicate: 'Duplicar',
        delete: 'Eliminar',
        clear: 'Limpiar',
        selectAll: 'Seleccionar todas las capas',
        mergeAll: 'Combinar todas las capas...',
    },
    paint: {
        resetAllBrushes: 'Restablecer todos los pinceles...',
        smallerBrush: 'Pincel más pequeño',
        biggerBrush: 'Pincel más grande',
        defaultColors: 'Colores predeterminados',
        swapColors: 'Intercambiar colores',
        darker: 'Más oscuro',
        brighter: 'Más brillante',
        grayer: 'Más gris',
        purer: 'Más puro',
        cooler: 'Más frío',
        warmer: 'Más cálido',
    },
    history: {
        newFromHistory: 'Nuevo desde el historial',
        clearHistory: 'Limpiar historial...',
        setHistoryLimit: 'Establecer límite de historial...',
    },
    panel: {
        showHide: 'Mostrar/ocultar paneles',
        showConsole: 'Mostrar Consola',
        showTool: 'Mostrar Herramienta',
        showLine: 'Mostrar Línea',
        showBrushList: 'Mostrar lista de Pinceles',
        showBrushOptions: 'Mostrar opciones de Pincel',
        showColor: 'Mostrar Color',
        showLayers: 'Mostrar Capas',
        showSelect: 'Mostrar Selección',
        showView: 'Mostrar Vista',
        showSidebar: 'Mostrar Barra lateral',
        showNumpad: 'Mostrar Teclado numérico',
        showExportbar: 'Mostrar Barra de exportación',
        showPerformance: 'Mostrar Rendimiento',
        closeAll: 'Cerrar todos los paneles',
        toolTip: 'Haz clic en el icono de la herramienta en la barra de herramientas o usa los atajos de teclado (por ejemplo, B para Pincel) para cambiar de herramienta.',
        brushTip: 'Haz clic en el icono del pincel en la barra de herramientas para abrir el panel de selección de pinceles.',
        brushOptionsTip: 'Los controles deslizantes de tamaño y opacidad del pincel están disponibles en la barra de herramientas.',
        colorTip: 'Haz clic en los selectores de color en la barra de herramientas para abrir el selector de color.',
        layersTip: 'Haz clic en el botón Capas en la barra de herramientas para abrir el panel de capas.',
        viewTip: 'Haz clic en el botón Ver en la barra de herramientas para abrir las opciones de visualización.',
        allPanels: 'Todos los Paneles',
        allPanelsTip: 'Todas las ventanas emergentes de los paneles se controlan desde la barra de herramientas.',
    },
    settings: {
        userInterface: 'Interfaz de usuario...',
        windowOpacity: 'Opacidad de la ventana...',
        penMapping: 'Mapeo del lápiz...',
        penPressure: 'Presión del lápiz...',
        multiTouch: 'Multitáctil...',
        rightSideButton: 'Botón derecho/lateral...',
        wheelDialScroller: 'Rueda/dial/desplazador...',
        language: 'Idioma...',
        leftHanded: 'Zurdo',
        flipToolbar: 'Voltear barra de herramientas',
    },
    languageDialog: {
        description: 'Cambiar el idioma de visualización de la interfaz de usuario de la aplicación.',
    },
    common: {
        save: 'Guardar',
        cancel: 'Cancelar',
    },
    notImplemented: {
        title: 'Función no implementada',
        description: 'Esta función aún no está disponible.',
    },
    noRecentProjects: {
        title: 'No hay proyectos recientes',
        description: 'Guarda un proyecto para verlo aquí.',
    },
  },
};

const I18nProvider = ({ children, locale }: { children: React.ReactNode, locale: Locale }) => {
    const t = (key: string) => {
        const keys = key.split('.');
        let result: any = translations[locale];
        for (const k of keys) {
            result = result?.[k];
            if (result === undefined) {
                // Fallback to English if translation is missing
                let fallbackResult: any = translations['en'];
                for (const fk of keys) {
                    fallbackResult = fallbackResult?.[fk];
                }
                return fallbackResult || key;
            }
        }
        return result || key;
    };
    
    return (
        <I18nContext.Provider value={{ locale, t }}>
            {children}
        </I18nContext.Provider>
    );
};

export default function Home() {
  const [locale, setLocale] = useState<Locale>('en');
  return (
    <I18nProvider locale={locale}>
      <CanvasSyncEditor setLocale={setLocale} />
    </I18nProvider>
  );
}
