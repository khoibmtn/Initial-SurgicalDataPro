import React, { useState } from 'react'; // v1.0.0
import toolsConfig from '../.antigravity/tools.json';
import { Terminal, Copy, Check, X, Command } from 'lucide-react';

interface Tool {
    name: string;
    command: string;
    category: string;
}

interface DevToolsConfigProps {
    isOpen: boolean;
    onClose: () => void;
}

export const DevToolsConfig: React.FC<DevToolsConfigProps> = ({ isOpen, onClose }) => {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleCopy = (cmd: string, id: string) => {
        navigator.clipboard.writeText(cmd);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Group tools by category
    const toolsByCategory: Record<string, Tool[]> = {};
    toolsConfig.tools.forEach((tool: Tool) => {
        if (!toolsByCategory[tool.category]) {
            toolsByCategory[tool.category] = [];
        }
        toolsByCategory[tool.category].push(tool);
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-gray-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-900 rounded-lg">
                            <Terminal className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Developer Tools</h3>
                            <p className="text-xs text-gray-500">Project Command Center</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-500"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">

                    {Object.entries(toolsByCategory).map(([category, tools], catIdx) => (
                        <div key={category} className="space-y-3">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                {category}
                            </h4>

                            <div className="grid grid-cols-1 gap-3">
                                {tools.map((tool, idx) => {
                                    const uniqueId = `${catIdx}-${idx}`;
                                    return (
                                        <div
                                            key={uniqueId}
                                            className="group bg-white rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-md transition-all duration-200 flex flex-col gap-3"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold text-gray-800 flex items-center gap-2">
                                                    <Command className="h-4 w-4 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    {tool.name}
                                                </span>
                                                <button
                                                    onClick={() => handleCopy(tool.command, uniqueId)}
                                                    className={`
                                        flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all
                                        ${copiedId === uniqueId
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'}
                                    `}
                                                >
                                                    {copiedId === uniqueId ? (
                                                        <>
                                                            <Check className="h-3.5 w-3.5" /> Copied
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="h-3.5 w-3.5" /> Copy Command
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                            <div className="bg-gray-900 rounded p-2.5 font-mono text-xs text-green-400 overflow-x-auto whitespace-nowrap scrollbar-hide">
                                                $ {tool.command}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-xs text-center text-gray-400">
                    Config loaded from <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-600">.antigravity/tools.json</code>
                </div>
            </div>
        </div>
    );
};
