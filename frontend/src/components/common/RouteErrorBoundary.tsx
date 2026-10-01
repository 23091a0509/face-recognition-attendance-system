import { useRouteError, useNavigate } from "react-router-dom";

export default function RouteErrorBoundary() {
    const error: any = useRouteError();
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-xl space-y-4">
                <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto text-3xl shadow-sm">
                    ⚠️
                </div>
                <h2 className="text-xl font-bold text-slate-900">Something went wrong</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                    {error?.statusText || error?.message || "An unexpected application error occurred."}
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-colors cursor-pointer"
                    >
                        Reload Page
                    </button>
                    <button
                        onClick={() => navigate(-1)}
                        className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        </div>
    );
}
