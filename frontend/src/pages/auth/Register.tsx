import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';

export default function Register() {
    const [studentId, setStudentId] = useState('');
    const [name, setName] = useState('');
    const [department, setDepartment] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleRegister() {
        setError('');
        if (!studentId || !name || !department || !password) {
            setError('All fields are required');
            return;
        }

        setLoading(true);
        try {
            await api.post('/auth/register', {
                student_id: studentId,
                name: name,
                department: department,
                password: password,
            });
            navigate('/login');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Registration failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8">
            <div className="relative w-full max-w-md">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 space-y-6">
                    <div className="text-center space-y-2">
                        <div className="inline-flex h-12 w-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 items-center justify-center font-black text-2xl shadow-sm mb-1">
                            ◉
                        </div>
                        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            Create Account
                        </h1>
                        <p className="text-sm text-slate-500">
                            Join AttendVision Biometric System
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                Student ID
                            </label>
                            <input
                                value={studentId}
                                onChange={(e) => setStudentId(e.target.value)}
                                disabled={loading}
                                placeholder="e.g. CS009"
                                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                Full Name
                            </label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={loading}
                                placeholder="Full Legal Name"
                                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                Academic Department
                            </label>
                            <input
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                disabled={loading}
                                placeholder="e.g. Computer Science & Engineering"
                                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                placeholder="Create a secure password"
                                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors text-sm"
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleRegister}
                            disabled={loading}
                            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all text-sm cursor-pointer"
                        >
                            {loading ? 'Creating Student Profile...' : 'Sign Up'}
                        </button>

                        <p className="text-center text-xs text-slate-500 pt-2">
                            Already enrolled?{' '}
                            <Link to="/login" className="text-blue-600 font-semibold hover:underline">
                                Return to Login
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
