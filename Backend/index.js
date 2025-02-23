import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

export const PORT = process.env.PORT || 3000
export const JWT_SECRET = process.env.JWT_SECRET || 'secret'

const app = express()
const prisma = new PrismaClient()

app.use(express.json())
app.use(cors())

const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Acceso denegado' })

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token inválido' })
    req.user = user
    next()
  })
}

const authenticateAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'No tienes permisos de administrador' })
  }
  next()
}

app.get('/', (req, res) => {
  res.send('<h1>Hello World</h1>')
})

app.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, adminId } = req.body
    const normalizedRole = role?.toUpperCase()

    if (!['ADMIN', 'USER'].includes(normalizedRole)) {
      return res.status(400).json({ message: "El rol debe ser 'ADMIN' o 'USER'" })
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })

    if (existingUser) return res.status(400).json({ message: 'Este usuario ya se encuentra registrado' })
    const hashedPassword = await bcrypt.hash(password, 10)
    const newUser = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: normalizedRole, adminId }
    })

    if (normalizedRole === 'ADMIN') {
      await prisma.user.update({
        where: { id: newUser.id },
        data: { adminId: newUser.id }
      })
    }

    res.status(201).json({ message: 'Usuario registrado correctamente', userId: newUser.id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(400).json({ message: 'El Usuario no existe' })
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) return res.status(400).json({ message: 'La contraseña es incorrecta' })
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' })
    res.json({ message: 'Inicio de sesión exitoso', token })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/logout', (req, res) => {
})

app.post('/admin/create', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    const normalizedRole = role?.toUpperCase()

    if (!['ADMIN', 'USER'].includes(normalizedRole)) {
      return res.status(400).json({ message: "El rol debe ser 'ADMIN' o 'USER'" })
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) return res.status(400).json({ message: 'Este usuario ya está registrado' })

    const hashedPassword = await bcrypt.hash(password, 10)
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: normalizedRole,
        adminId: normalizedRole === 'ADMIN' ? undefined : req.user.userId // Asigna adminId si es USER
      }
    })

    res.status(201).json({ message: 'Usuario creado correctamente', userId: newUser.id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.put('/admin/update/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, email } = req.body

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name, email }
    })

    res.json({ message: 'Usuario actualizado', user: updatedUser })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.delete('/admin/delete/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.user.delete({ where: { id } })
    res.json({ message: 'Usuario eliminado correctamente' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/admin/read', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { adminId: req.user.userId },
      select: { id: true, name: true, email: true, role: true }
    })
    res.json(users)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/admin/read/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/profile', authenticateToken, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
  res.json(user)
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
