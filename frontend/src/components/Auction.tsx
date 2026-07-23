import React, { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import { formatDuration } from '../utils/helper'

type BidRecord = {
    bidderName: string
    amount: string
    createdAt: string
}

type Product = {
    id: string
    title: string
    startingPrice: string
    currentPrice?: string
    timerStartsAt?: string
    timerEndsAt?: string
    bids?: BidRecord[]

    bidderName: string
    amount: string
} | null

enum AuctionState {
    DURING = 'DURING',
    END = 'END',
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? BACKEND_URL
const socket = io(SOCKET_URL)

export default function Auction() {
    const [product, setProduct] = useState<Product | null>(null)
    const [latestBid, setLatestBid] = useState<LatestBid>(null)
    const [name, setName] = useState(() => localStorage.getItem('bidderName') || '')
    const [amount, setAmount] = useState<number | null>(null)
    const [timeLeft, setTimeLeft] = useState('00d 00h 00m 00s')
    const [serverOffsetMs, setServerOffsetMs] = useState<number>(0)
    const [error, setError] = useState<string | null>(null)
    const isMounted = useRef(false)
    const timerRef = useRef<number | null>(null)

    const refreshProduct = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/auction/product`)
            const p = await res.json()
            const payload = Array.isArray(p) ? p[0] : p
            const prod = payload.product || payload
            setProduct(prod)
            if (payload.serverTime) {
                setServerOffsetMs(new Date(payload.serverTime).getTime() - Date.now())
            }
            if (prod?.bids?.length) {
                const topBid = prod.bids.reduce((highest: BidRecord, next: BidRecord) =>
                    parseInt(next.amount, 10) > parseInt(highest.amount, 10) ? next : highest,
                prod.bids[0])
                setLatestBid({ bidderName: topBid.bidderName, amount: String(parseInt(topBid.amount, 10)) })
            }
        } catch (err) {
            console.error('Failed to refresh product', err)
        }
    }

    useEffect(() => {
        refreshProduct()

        socket.on('bid_updated', (payload: any) => {
            setProduct(payload.product)
            if (payload.serverTime) {
                setServerOffsetMs(new Date(payload.serverTime).getTime() - Date.now())
            }
            setLatestBid({ bidderName: payload.bid.bidderName, amount: String(parseInt(payload.bid.amount, 10)) })
        })
        socket.on('auction_ended', (payload: any) => {
            setProduct(payload.product)
            if (payload.serverTime) {
                setServerOffsetMs(new Date(payload.serverTime).getTime() - Date.now())
            }
            if (payload.winner) {
                setLatestBid({ bidderName: payload.winner.bidderName, amount: String(parseInt(payload.winner.amount, 10)) })
            }
        })

        isMounted.current = true
        return () => {
            socket.off('bid_updated')
            socket.off('auction_ended')
        }
    }, [])

    const getAuctionState = (product: Product | null): AuctionState => {
        if (!product) return AuctionState.END
        if (!product.timerEndsAt) return AuctionState.END
        const ends = new Date(product.timerEndsAt).getTime()
        const now = Date.now() + serverOffsetMs
        return ends > now ? AuctionState.DURING : AuctionState.END
    }

    useEffect(() => {
        const state = getAuctionState(product)
        const clearTimer = () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
            }
        }

        if (!product) {
            clearTimer()
            return
        }

        if (state === AuctionState.DURING && product.timerEndsAt) {
            clearTimer()
            const updateClock = () => {
                const ends = new Date(product.timerEndsAt!).getTime()
                const now = Date.now() + serverOffsetMs
                const diff = Math.max(0, ends - now)
                setTimeLeft(formatDuration(diff))
                return diff
            }

            // const diff = updateClock()
            timerRef.current = window.setInterval(() => {
                const remaining = updateClock()
                if (remaining <= 0) {
                    clearTimer()
                    refreshProduct()
                }
            }, 250)

            return () => clearTimer()
        }

        // ensure no countdown runs after it ends
        clearTimer()
        if (state === AuctionState.END) setTimeLeft('ENDED')
    }, [product, serverOffsetMs])

    const submitBid = async () => {
        const stateBeforeSubmit = getAuctionState(product)

        // Allow submitting when there is no product (first bidder starts the auction)
        // or when the previous auction has ended. Do not block bids for scheduled auctions.
        // client-side validation
        if (!name || amount == null) {
            setError('Please provide both name and amount to bid')
            return
        }
        localStorage.setItem('bidderName', name)

        try {
            const payload = { bidderName: name, amount }
            console.debug('Submitting bid payload', payload)

            const res = await fetch(`${BACKEND_URL}/auction/bid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            if (!res.ok) {
                // try to parse structured error
                let serverMessage: string | null = null
                try {
                    const json = await res.json()
                    if (Array.isArray(json?.message)) {
                        serverMessage = json.message.join('; ')
                    } else {
                        serverMessage = json?.message || json?.error || JSON.stringify(json)
                    }
                } catch (e) {
                    serverMessage = (await res.text()) || null
                }

                if (res.status >= 500) {
                    setError('Server error — please try again later.')
                } else if (res.status === 400) {
                    setError(serverMessage || 'Invalid bid — please check your values.')
                } else if (res.status === 401 || res.status === 403) {
                    setError('You are not authorized to place a bid.')
                } else {
                    setError(serverMessage || `Error ${res.status}`)
                }

                return
            }

            // success: clear errors
            setError(null)
        // server will broadcast update
        } catch (err: any) {
            setError(err?.message || 'Network error — check your connection')
        }
    }

    const quickInc = () => {
        const state = getAuctionState(product)

        // If no product or auction already ended, start from 0
        if (!product || state === AuctionState.END) {
            setAmount((prev) => (prev == null ? 100 : prev + 100))
            return
        }

        const latestPrice = product.bids && product.bids.length
        ? product.bids.reduce((highest: BidRecord, next: BidRecord) =>
            Number(next.amount) > Number(highest.amount) ? next : highest,
            product.bids[0],
        ).amount
        : String(Number(product.startingPrice))

        const baseFromAmount = amount ?? NaN
        const baseFromProduct = Number(latestPrice)
        const baseFromStarting = Number(product.startingPrice)
        const base = Number.isFinite(baseFromAmount)
            ? baseFromAmount
            : Number.isFinite(baseFromProduct)
            ? baseFromProduct
            : Number.isFinite(baseFromStarting)
            ? baseFromStarting
            : 0

        setAmount(base + 100)
    }

    const handleAmountChange = (value: string) => {
        const sanitized = value.replace(/[^0-9]/g, '')
        if (sanitized === '') {
            setAmount(null)
            setError(null)
            return
        }

        if (/^[0-9]{1,13}$/.test(sanitized)) {
            setAmount(Number(sanitized))
            setError(null)
        } else {
            setError('Amount is too large or invalid. Enter a number up to 13 digits.')
        }
    }

    return (
        <div className="auction">
        <header><strong>Timer:</strong> {timeLeft}</header>
        <main>
            {!product && <p>No active auction — place a bid to start one.</p>}
            {/* Removed pre-start display; auction starts when bidding begins */}
            {product && product.timerEndsAt && <p>Ends At - {new Date(product.timerEndsAt).toLocaleString()}</p>}
            {product && <p>Starting Price - {String(parseInt(product.startingPrice, 10))}</p>}
            {/* Removed 'NOT YET STARTED' message; bidding allowed even when scheduled */}
            {product && getAuctionState(product) === AuctionState.DURING && (
            <div>
                <p>
                Current Bid - {latestBid?.amount || String(parseInt(product.startingPrice, 10))} {latestBid?.bidderName ? `(${latestBid.bidderName})` : ''}
                </p>
                {!latestBid && <p>Awaiting highest bid details...</p>}
            </div>
            )}
            {product && getAuctionState(product) === AuctionState.END && (
            <div>
                <p>Winner resolved</p>
                {latestBid ? (
                <p>
                    Won By {latestBid.bidderName} ({String(parseInt(latestBid.amount, 10))})
                </p>
                ) : (
                <p>No winner data available</p>
                )}
            </div>
            )}
        </main>
            <div className="action-bar">
                <input value={amount != null ? String(amount) : ''} onChange={(e) => handleAmountChange(e.target.value)} placeholder="Amount" />
                <button onClick={quickInc}>+100</button>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                <button onClick={submitBid} >
                Bid
                </button>
            </div>
            {error && <div className="error">{error}</div>}
        </div>
    )
}
