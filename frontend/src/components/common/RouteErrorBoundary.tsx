import { useRouteError, useNavigate } from "react-router-dom";

export default function RouteErrorBoundary() {
    const error: any = useRouteError();
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-[#0b1120] border border-slate-800 rounded-2xl p-6 text-center shadow-2xl">
                <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4 text-2xl">
                    ⚠️
                </div>
                <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    {error?.statusText || error?.message || "An unexpected application error occurred."}
                </p>
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-black bg-emerald-400 hover:bg-emerald-300 transition-colors"
                    >
                        Reload Page
                    </button>
                    <button
                        onClick={() => navigate(-1)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        </div>
    );
}
