const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const fs = require('fs').promises
const path = require('path')

const app = express()
const PORT = 3001
const DB_FILE = path.join(__dirname, 'database.json')
const JWT_SECRET = 'your-secret-key-change-this-in-production'
const SALT_ROUNDS = 10

app.use(cors())
app.use(express.json())

async function initDatabase() {
    try {
        await fs.access(DB_FILE)
    } catch {
        const initialData = {
            messages: [],
            users: [],
        }
        await fs.writeFile(DB_FILE, JSON.stringify(initialData, null, 2))
        console.log('Database initialized')
    }
}

async function readDB() {
    const data = await fs.readFile(DB_FILE, 'utf8')
    return JSON.parse(data)
}

async function writeDB(data) {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2))
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
        return res.status(401).json({ error: 'Access token required' })
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' })
        }
        req.user = user
        next()
    })
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, email } = req.body

        if (!username || !password) {
            return res
                .status(400)
                .json({ error: 'Username and password are required' })
        }

        if (username.length < 3) {
            return res
                .status(400)
                .json({ error: 'Username must be at least 3 characters' })
        }

        if (password.length < 6) {
            return res
                .status(400)
                .json({ error: 'Password must be at least 6 characters' })
        }

        const db = await readDB()

        if (db.users.find((u) => u.username === username)) {
            return res.status(409).json({ error: 'Username already exists' })
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

        const newUser = {
            id: db.users.length + 1,
            username,
            email: email || `${username}@example.com`,
            password: hashedPassword,
            createdAt: new Date().toISOString(),
        }

        db.users.push(newUser)
        await writeDB(db)

        const token = jwt.sign(
            { userId: newUser.id, username: newUser.username },
            JWT_SECRET,
            { expiresIn: '24h' },
        )

        res.status(201).json({
            success: true,
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
            },
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error during registration' })
    }
})

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body

        if (!username || !password) {
            return res
                .status(400)
                .json({ error: 'Username and password are required' })
        }

        const db = await readDB()
        const user = db.users.find((u) => u.username === username)

        if (!user) {
            return res
                .status(401)
                .json({ error: 'Invalid username or password' })
        }

        const validPassword = await bcrypt.compare(password, user.password)

        if (!validPassword) {
            return res
                .status(401)
                .json({ error: 'Invalid username or password' })
        }

        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' },
        )

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
            },
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Server error during login' })
    }
})

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const db = await readDB()
        const user = db.users.find((u) => u.id === req.user.userId)

        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            createdAt: user.createdAt,
        })
    } catch (err) {
        res.status(500).json({ error: 'Server error' })
    }
})

app.get('/api/messages', async (req, res) => {
    try {
        const db = await readDB()

        const messages = db.messages
            .map((m) => ({
                id: m.id,
                content: m.content,
                userId: m.userId,
                username: m.username,
                likes: m.likes,
                reports: m.reports,
                likedBy: m.likedBy,
                createdAt: m.createdAt,
            }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

        res.json(messages)
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch messages' })
    }
})

app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body

        if (!content || !content.trim()) {
            return res
                .status(400)
                .json({ error: 'Message content is required' })
        }

        if (content.length > 500) {
            return res
                .status(400)
                .json({ error: 'Message too long (max 500 characters)' })
        }

        const db = await readDB()

        const newMessage = {
            id: db.messages.length + 1,
            content: content.trim(),
            userId: req.user.userId,
            username: req.user.username,
            likes: 0,
            reports: 0,
            likedBy: [],
            reportedBy: [],
            createdAt: new Date().toISOString(),
        }

        db.messages.push(newMessage)
        await writeDB(db)

        res.status(201).json(newMessage)
    } catch (err) {
        res.status(500).json({ error: 'Failed to create message' })
    }
})

app.delete('/api/messages/:id', authenticateToken, async (req, res) => {
    try {
        const messageId = parseInt(req.params.id)

        const db = await readDB()
        const messageIndex = db.messages.findIndex((m) => m.id === messageId)

        if (messageIndex === -1) {
            return res.status(404).json({ error: 'Message not found' })
        }

        if (db.messages[messageIndex].userId !== req.user.userId) {
            return res
                .status(403)
                .json({ error: 'Not authorized to delete this message' })
        }

        db.messages.splice(messageIndex, 1)
        await writeDB(db)

        res.json({ success: true, message: 'Message deleted' })
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete message' })
    }
})

app.post('/api/messages/:id/like', authenticateToken, async (req, res) => {
    try {
        const messageId = parseInt(req.params.id)
        const userId = req.user.userId

        const db = await readDB()
        const message = db.messages.find((m) => m.id === messageId)

        if (!message) {
            return res.status(404).json({ error: 'Message not found' })
        }

        if (message.likedBy.includes(userId)) {
            message.likedBy = message.likedBy.filter((id) => id !== userId)
            message.likes = Math.max(0, message.likes - 1)
        } else {
            message.likedBy.push(userId)
            message.likes += 1
        }

        await writeDB(db)
        res.json(message)
    } catch (err) {
        res.status(500).json({ error: 'Failed to like message' })
    }
})

app.post('/api/messages/:id/report', authenticateToken, async (req, res) => {
    try {
        const messageId = parseInt(req.params.id)
        const userId = req.user.userId

        const db = await readDB()
        const message = db.messages.find((m) => m.id === messageId)

        if (!message) {
            return res.status(404).json({ error: 'Message not found' })
        }

        if (message.reportedBy.includes(userId)) {
            return res
                .status(400)
                .json({ error: 'Already reported this message' })
        }

        message.reportedBy.push(userId)
        message.reports += 1

        await writeDB(db)
        res.json({ success: true, message: 'Message reported' })
    } catch (err) {
        res.status(500).json({ error: 'Failed to report message' })
    }
})

app.get('/api/stats', async (req, res) => {
    try {
        const db = await readDB()

        const stats = {
            totalMessages: db.messages.length,
            totalUsers: db.users.length,
            totalLikes: db.messages.reduce((sum, m) => sum + m.likes, 0),
            totalReports: db.messages.reduce((sum, m) => sum + m.reports, 0),
        }

        res.json(stats)
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' })
    }
})

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Feedback Wall API running on http://localhost:${PORT}`)
        console.log(`📝 Database file: ${DB_FILE}`)
        console.log(`🔐 JWT Authentication enabled`)
        console.log('\nAvailable endpoints:')
        console.log('  PUBLIC:')
        console.log('    POST   /api/auth/register')
        console.log('    POST   /api/auth/login')
        console.log('    GET    /api/messages')
        console.log('    GET    /api/stats')
        console.log('  PROTECTED (require JWT token):')
        console.log('    GET    /api/auth/me')
        console.log('    POST   /api/messages')
        console.log('    DELETE /api/messages/:id')
        console.log('    POST   /api/messages/:id/like')
        console.log('    POST   /api/messages/:id/report')
    })
})

process.on('SIGINT', () => {
    console.log('\n👋 Shutting down gracefully...')
    process.exit(0)
})
