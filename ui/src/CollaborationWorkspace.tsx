import React from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    Slider,
    Stack,
    Tab,
    Tabs,
    Tooltip,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import LinkIcon from '@mui/icons-material/Link';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import CodeIcon from '@mui/icons-material/Code';
import DataObjectIcon from '@mui/icons-material/DataObject';
import BrushIcon from '@mui/icons-material/Brush';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import PanToolIcon from '@mui/icons-material/PanTool';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DeleteIcon from '@mui/icons-material/Delete';
import {EditorContent, useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import {ConnectedRoom, UseRoom} from './useRoom';

const remoteOrigin = Symbol('peerloom-remote');
const encode = (bytes: Uint8Array) => {
    let binary = '';
    for (let offset = 0; offset < bytes.byteLength; offset += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
};
const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const CollaborativeEditor = ({document}: {document: Y.Doc}) => {
    const editor = useEditor(
        {
            immediatelyRender: false,
            extensions: [
                StarterKit.configure({undoRedo: false}),
                Collaboration.configure({document}),
            ],
            editorProps: {
                attributes: {
                    style: 'min-height: 380px; padding: 18px; outline: none;',
                    'data-placeholder': '开始共同书写…',
                },
            },
        },
        [document]
    );

    const command = (action: () => void) => {
        action();
        editor?.commands.focus();
    };
    const createLink = () => {
        const url = window.prompt('请输入链接地址');
        if (url)
            command(() =>
                editor?.chain().focus().extendMarkRange('link').setLink({href: url}).run()
            );
    };
    const tools: Array<{label: string; action: () => void; icon: React.ReactNode}> = [
        {
            label: '撤销',
            action: () => command(() => editor?.commands.undo()),
            icon: <UndoIcon fontSize="small" />,
        },
        {
            label: '重做',
            action: () => command(() => editor?.commands.redo()),
            icon: <RedoIcon fontSize="small" />,
        },
        {
            label: '一级标题',
            action: () => command(() => editor?.chain().focus().toggleHeading({level: 1}).run()),
            icon: <span>H₁</span>,
        },
        {
            label: '二级标题',
            action: () => command(() => editor?.chain().focus().toggleHeading({level: 2}).run()),
            icon: <span>H₂</span>,
        },
        {
            label: '加粗',
            action: () => command(() => editor?.chain().focus().toggleBold().run()),
            icon: <FormatBoldIcon fontSize="small" />,
        },
        {
            label: '斜体',
            action: () => command(() => editor?.chain().focus().toggleItalic().run()),
            icon: <FormatItalicIcon fontSize="small" />,
        },
        {
            label: '删除线',
            action: () => command(() => editor?.chain().focus().toggleStrike().run()),
            icon: <StrikethroughSIcon fontSize="small" />,
        },
        {label: '添加链接', action: createLink, icon: <LinkIcon fontSize="small" />},
        {
            label: '无序列表',
            action: () => command(() => editor?.chain().focus().toggleBulletList().run()),
            icon: <FormatListBulletedIcon fontSize="small" />,
        },
        {
            label: '有序列表',
            action: () => command(() => editor?.chain().focus().toggleOrderedList().run()),
            icon: <FormatListNumberedIcon fontSize="small" />,
        },
        {
            label: '待办列表',
            action: () =>
                command(() => editor?.chain().focus().toggleBulletList().insertContent('☐ ').run()),
            icon: <ChecklistIcon fontSize="small" />,
        },
        {
            label: '引用',
            action: () => command(() => editor?.chain().focus().toggleBlockquote().run()),
            icon: <FormatQuoteIcon fontSize="small" />,
        },
        {
            label: '行内代码',
            action: () => command(() => editor?.chain().focus().toggleCode().run()),
            icon: <CodeIcon fontSize="small" />,
        },
        {
            label: '代码块',
            action: () => command(() => editor?.chain().focus().toggleCodeBlock().run()),
            icon: <DataObjectIcon fontSize="small" />,
        },
    ];

    return (
        <Box
            sx={{border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden'}}
        >
            <Box
                role="toolbar"
                aria-label="协作文档格式工具栏"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                    px: 1,
                    py: 0.5,
                    overflowX: 'auto',
                }}
            >
                {tools.map((tool, index) => (
                    <React.Fragment key={tool.label}>
                        {[2, 4, 7, 11].includes(index) && (
                            <Divider orientation="vertical" flexItem sx={{mx: 0.5}} />
                        )}
                        <Tooltip title={tool.label} arrow>
                            <IconButton
                                size="small"
                                aria-label={tool.label}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={tool.action}
                            >
                                {tool.icon}
                            </IconButton>
                        </Tooltip>
                    </React.Fragment>
                ))}
            </Box>
            <Divider />
            <EditorContent editor={editor} />
        </Box>
    );
};

type Stroke = {id: string; color: string; width: number; points: Array<[number, number]>};
const CollaborativeCanvas = ({document}: {document: Y.Doc}) => {
    const strokes = React.useMemo(() => document.getArray<Stroke>('strokes'), [document]);
    const undoManager = React.useMemo(() => new Y.UndoManager(strokes), [strokes]);
    const [items, setItems] = React.useState<Stroke[]>(strokes.toArray());
    const [drawing, setDrawing] = React.useState<Stroke | null>(null);
    const [tool, setTool] = React.useState<'brush' | 'eraser' | 'pan'>('brush');
    const [color, setColor] = React.useState('#58a6ff');
    const [width, setWidth] = React.useState(3);
    const [zoom, setZoom] = React.useState(1);
    const [offset, setOffset] = React.useState<[number, number]>([0, 0]);
    const [panning, setPanning] = React.useState<{
        clientX: number;
        clientY: number;
        offset: [number, number];
    } | null>(null);
    React.useEffect(() => {
        const refresh = () => setItems(strokes.toArray());
        strokes.observe(refresh);
        return () => strokes.unobserve(refresh);
    }, [strokes]);
    React.useEffect(() => () => undoManager.destroy(), [undoManager]);
    const point = (event: React.PointerEvent<SVGSVGElement>): [number, number] => {
        const rect = event.currentTarget.getBoundingClientRect();
        return [
            Math.round((event.clientX - rect.left - offset[0]) / zoom),
            Math.round((event.clientY - rect.top - offset[1]) / zoom),
        ];
    };
    const path = (stroke: Stroke) =>
        stroke.points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ');
    return (
        <Box sx={{height: 460, border: '1px solid', borderColor: 'divider'}}>
            <Box
                role="toolbar"
                aria-label="协同画板工具栏"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    minHeight: 48,
                    px: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    overflowX: 'auto',
                }}
            >
                <Tooltip title="画笔">
                    <IconButton
                        size="small"
                        color={tool === 'brush' ? 'primary' : 'default'}
                        onClick={() => setTool('brush')}
                    >
                        <BrushIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Tooltip title="橡皮擦">
                    <IconButton
                        size="small"
                        color={tool === 'eraser' ? 'primary' : 'default'}
                        onClick={() => setTool('eraser')}
                    >
                        <CleaningServicesIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Tooltip title="拖动画布">
                    <IconButton
                        size="small"
                        color={tool === 'pan' ? 'primary' : 'default'}
                        onClick={() => setTool('pan')}
                    >
                        <PanToolIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Divider orientation="vertical" flexItem sx={{my: 1}} />
                <Tooltip title="画笔颜色">
                    <IconButton component="label" size="small">
                        <Box
                            component="span"
                            sx={{
                                display: 'block',
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                backgroundColor: color,
                                border: '2px solid',
                                borderColor: 'divider',
                            }}
                        />
                        <input
                            type="color"
                            value={color}
                            onChange={(event) => setColor(event.target.value)}
                            hidden
                        />
                    </IconButton>
                </Tooltip>
                <Box sx={{width: 100, px: 1}}>
                    <Slider
                        value={width}
                        min={1}
                        max={16}
                        size="small"
                        onChange={(_, value) => setWidth(value as number)}
                        aria-label="画笔粗细"
                    />
                </Box>
                <Divider orientation="vertical" flexItem sx={{my: 1}} />
                <IconButton
                    size="small"
                    onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
                    aria-label="缩小"
                >
                    <ZoomOutIcon fontSize="small" />
                </IconButton>
                <Box sx={{minWidth: 42, textAlign: 'center', typography: 'caption'}}>
                    {Math.round(zoom * 100)}%
                </Box>
                <IconButton
                    size="small"
                    onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
                    aria-label="放大"
                >
                    <ZoomInIcon fontSize="small" />
                </IconButton>
                <Tooltip title="重置视图">
                    <IconButton
                        size="small"
                        onClick={() => {
                            setZoom(1);
                            setOffset([0, 0]);
                        }}
                    >
                        <RestartAltIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Divider orientation="vertical" flexItem sx={{my: 1}} />
                <Tooltip title="撤销我的上一步操作">
                    <span>
                        <IconButton
                            size="small"
                            onClick={() => undoManager.undo()}
                            disabled={!undoManager.canUndo()}
                        >
                            <UndoIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="清空画板">
                    <span>
                        <IconButton
                            size="small"
                            color="error"
                            onClick={() =>
                                document.transact(() => strokes.delete(0, strokes.length))
                            }
                            disabled={!items.length}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>
            <svg
                width="100%"
                height="calc(100% - 48px)"
                style={{
                    touchAction: 'none',
                    cursor: tool === 'pan' ? 'grab' : tool === 'eraser' ? 'cell' : 'crosshair',
                }}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    if (tool === 'pan') {
                        setPanning({clientX: event.clientX, clientY: event.clientY, offset});
                        return;
                    }
                    const current = point(event);
                    if (tool === 'eraser') {
                        const radius = Math.max(12, width * 3);
                        const indices = strokes
                            .toArray()
                            .reduce<number[]>((result, stroke, index) => {
                                if (
                                    stroke.points.some(
                                        ([x, y]) =>
                                            Math.hypot(x - current[0], y - current[1]) <= radius
                                    )
                                )
                                    result.push(index);
                                return result;
                            }, []);
                        if (indices.length)
                            document.transact(() =>
                                indices.reverse().forEach((index) => strokes.delete(index, 1))
                            );
                        return;
                    }
                    setDrawing({id: crypto.randomUUID(), color, width, points: [current]});
                }}
                onPointerMove={(event) => {
                    if (panning && tool === 'pan') {
                        setOffset([
                            panning.offset[0] + event.clientX - panning.clientX,
                            panning.offset[1] + event.clientY - panning.clientY,
                        ]);
                        return;
                    }
                    if (drawing && event.buttons && tool === 'brush')
                        setDrawing({...drawing, points: [...drawing.points, point(event)]});
                }}
                onPointerUp={() => {
                    if (drawing) document.transact(() => strokes.push([drawing]));
                    setDrawing(null);
                    setPanning(null);
                }}
            >
                <g transform={`translate(${offset[0]} ${offset[1]}) scale(${zoom})`}>
                    {items.map((stroke) => (
                        <path
                            key={stroke.id}
                            d={path(stroke)}
                            stroke={stroke.color}
                            strokeWidth={stroke.width ?? 3}
                            fill="none"
                            strokeLinecap="round"
                        />
                    ))}
                    {drawing && (
                        <path
                            d={path(drawing)}
                            stroke={drawing.color}
                            strokeWidth={drawing.width}
                            fill="none"
                            strokeLinecap="round"
                        />
                    )}
                </g>
            </svg>
        </Box>
    );
};

export const CollaborationWorkspace = ({
    state,
    sendRoomMessage,
    initialTab = 0,
    hideTriggers = false,
}: Pick<UseRoom, 'sendRoomMessage'> & {
    state: ConnectedRoom;
    initialTab?: number;
    hideTriggers?: boolean;
}) => {
    const [open, setOpen] = React.useState(false);
    const [tab, setTab] = React.useState(initialTab);
    const document = React.useMemo(() => new Y.Doc(), []);
    const canvas = React.useMemo(() => new Y.Doc(), []);
    const seen = React.useRef(new Set<string>());
    const fragments = React.useRef(new Map<string, {parts: string[]; total: number}>());
    const sendUpdate = React.useCallback(
        (kind: 'document-update' | 'whiteboard-update', update: Uint8Array, to?: string[]) => {
            const payload = encode(update);
            const chunkSize = 120_000;
            if (payload.length <= chunkSize) {
                sendRoomMessage(kind, {type: 'update', payload}, to);
                return;
            }
            const id = crypto.randomUUID();
            const total = Math.ceil(payload.length / chunkSize);
            for (let index = 0; index < total; index += 1)
                sendRoomMessage(
                    kind,
                    {
                        type: 'chunk',
                        id,
                        index,
                        total,
                        payload: payload.slice(index * chunkSize, (index + 1) * chunkSize),
                    },
                    to
                );
        },
        [sendRoomMessage]
    );

    React.useEffect(() => {
        const relay =
            (kind: 'document-update' | 'whiteboard-update') =>
            (update: Uint8Array, origin: unknown) => {
                if (origin === remoteOrigin) return;
                sendUpdate(kind, update);
            };
        const documentRelay = relay('document-update');
        const canvasRelay = relay('whiteboard-update');
        document.on('update', documentRelay);
        canvas.on('update', canvasRelay);
        sendRoomMessage('document-update', {type: 'sync-request'});
        sendRoomMessage('whiteboard-update', {type: 'sync-request'});
        return () => {
            document.off('update', documentRelay);
            canvas.off('update', canvasRelay);
            document.destroy();
            canvas.destroy();
        };
    }, [canvas, document, sendRoomMessage, sendUpdate]);

    React.useEffect(() => {
        for (const message of state.roomMessages) {
            if (
                (message.kind !== 'document-update' && message.kind !== 'whiteboard-update') ||
                message.from === state.users.find((user) => user.you)?.id
            )
                continue;
            const key = `${message.at}-${message.from}-${message.kind}`;
            if (seen.current.has(key)) continue;
            seen.current.add(key);
            const data = message.data as {
                type?: string;
                payload?: string;
                id?: string;
                index?: number;
                total?: number;
            };
            const target = message.kind === 'document-update' ? document : canvas;
            if (data.type === 'sync-request')
                sendUpdate(message.kind, Y.encodeStateAsUpdate(target), [message.from]);
            if (data.type === 'update' && data.payload)
                Y.applyUpdate(target, decode(data.payload), remoteOrigin);
            if (
                data.type === 'chunk' &&
                data.id &&
                data.payload &&
                typeof data.index === 'number' &&
                typeof data.total === 'number'
            ) {
                const key = `${message.kind}:${data.id}`;
                const current = fragments.current.get(key) ?? {
                    parts: Array(data.total),
                    total: data.total,
                };
                current.parts[data.index] = data.payload;
                fragments.current.set(key, current);
                if (current.parts.filter(Boolean).length === current.total) {
                    fragments.current.delete(key);
                    Y.applyUpdate(target, decode(current.parts.join('')), remoteOrigin);
                }
            }
        }
    }, [canvas, document, sendRoomMessage, sendUpdate, state.roomMessages, state.users]);

    if (hideTriggers)
        return (
            <>
                {initialTab === 0 ? (
                    <CollaborativeEditor document={document} />
                ) : (
                    <CollaborativeCanvas document={canvas} />
                )}
            </>
        );
    return (
        <>
            <Stack direction="row" spacing={0.5}>
                <Button
                    size="small"
                    onClick={() => {
                        setTab(0);
                        setOpen(true);
                    }}
                >
                    文档
                </Button>
                <Button
                    size="small"
                    onClick={() => {
                        setTab(1);
                        setOpen(true);
                    }}
                >
                    画板
                </Button>
            </Stack>
            <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="lg">
                <DialogTitle>多人协作</DialogTitle>
                <DialogContent>
                    <Tabs value={tab} onChange={(_, value) => setTab(value)}>
                        <Tab label="文档" />
                        <Tab label="画板" />
                    </Tabs>
                    {tab === 0 ? (
                        <CollaborativeEditor document={document} />
                    ) : (
                        <CollaborativeCanvas document={canvas} />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};
