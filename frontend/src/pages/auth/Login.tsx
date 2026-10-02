import { useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';

import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../../services/api';

interface ValidationErrors {
    username?: string;
    password?: string;
}

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isExpired = searchParams.get('expired') === 'true';

    // Validate individual field
    const validateField = (
        name: 'username' | 'password',
        value: string
    ): string => {
        if (name === 'username') {
            if (!value.trim()) return 'Username is required';
            if (value.length < 2)
                return 'Username must be at least 2 characters';
        }

        if (name === 'password') {
            if (!value) return 'Password is required';
            if (value.length < 2)
                return 'Password must be at least 2 characters';
        }

        return '';
    };

    const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setUsername(value);
        setError('');

        if (errors.username !== undefined) {
            setErrors(prev => ({
                ...prev,
                username: validateField('username', value),
            }));
        }
    };

    const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setPassword(value);
        setError('');

        if (errors.password !== undefined) {
            setErrors(prev => ({
                ...prev,
                password: validateField('password', value),
            }));
        }
    };

    const handleUsernameBlur = () => {
        setErrors(prev => ({
            ...prev,
            username: validateField('username', username),
        }));
    };

    const handlePasswordBlur = () => {
        setErrors(prev => ({
            ...prev,
            password: validateField('password', password),
        }));
    };

    const validateForm = (): boolean => {
        const newErrors: ValidationErrors = {
            username: validateField('username', username),
            password: validateField('password', password),
        };

        setErrors(newErrors);
        return !newErrors.username && !newErrors.password;
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    };

    async function handleLogin() {
        setError('');

        if (!validateForm()) return;

        setLoading(true);

        try {
            // IMPORTANT: OAuth2PasswordRequestForm needs FORM DATA
            const body = new URLSearchParams();
            body.append('username', username);
            body.append('password', password);

            const res = await api.post('/auth/login', body, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            localStorage.setItem('token', res.data.access_token);

            if (username === 'admin') {
                navigate('/admin', { replace: true });
            } else {
                navigate('/student', { replace: true });
            }
        } catch (err: any) {
            console.error('Login request failed:', err);
            if (err.response?.data?.detail) {
                setError(err.response.data.detail);
            } else if (err.message === 'Network Error' || !err.response) {
                setError('Cannot reach backend server. Please verify your device is connected to the same Wi-Fi.');
            } else {
                setError('Invalid credentials. Please verify your ID and password.');
            }
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
                            AttendVision
                        </h1>
                        <p className="text-sm text-slate-500">
                            Biometric Face Attendance System
                        </p>
                    </div>

                    <div className="space-y-4">
                        {isExpired && (
                            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs text-center font-medium">
                                Your session has expired. Please sign in again.
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                Student ID or Username
                            </label>
                            <input
                                value={username}
                                onChange={handleUsernameChange}
                                onBlur={handleUsernameBlur}
                                onKeyDown={handleKeyDown}
                                disabled={loading}
                                placeholder="e.g. CS001 or admin"
                                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors text-sm"
                            />
                            {errors.username && (
                                <p className="text-rose-600 text-xs mt-1">{errors.username}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={handlePasswordChange}
                                onBlur={handlePasswordBlur}
                                onKeyDown={handleKeyDown}
                                disabled={loading}
                                placeholder="Enter your account password"
                                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors text-sm"
                            />
                            {errors.password && (
                                <p className="text-rose-600 text-xs mt-1">{errors.password}</p>
                            )}
                        </div>

                        {error && (
                            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleLogin}
                            disabled={loading}
                            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all text-sm cursor-pointer"
                        >
                            {loading ? 'Signing In...' : 'Sign In'}
                        </button>

                        <p className="text-center text-xs text-slate-500 pt-2">
                            Don't have an account yet?{' '}
                            <Link to="/register" className="text-blue-600 font-semibold hover:underline">
                                Register as Student
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
