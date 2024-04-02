const bedrock = require('bedrock-protocol'),
    util = require('./index'),
    config = require('./config.json'),
    fs = require('fs'),
    players = new Map(),
    uuid = require('uuid'),
    realmClients = new Map()

function sendCmd(client, ...cmds) {
    cmds.forEach((cmd) => {

        const requestId = uuid.v4()
        try {
            client.write('command_request', {
                command: cmd,
                origin: {
                    type: 'player',
                    uuid: requestId,
                    request_id: requestId,
                },
                internal: true,
                version: 52,
            })
        } catch (err) {
            console.error(err.message)
        }
    })
}

const devices = [
    "Undefined",
    "Android",
    "iOS",
    "OSX",
    "FireOS",
    "GearVR",
    "Hololens",
    "Windows",
    "Win32",
    "Dedicated",
    "TVOS",
    "PlayStation",
    "NintendoSwitch",
    "Xbox",
    "WindowsPhone"
]

function getConfig() {
    return JSON.parse(fs.readFileSync('./config.json', 'utf-8'))
}

function spawnBot(realm) {
    const client = bedrock.createClient({
        username: config.username,
        profilesFolder: './accounts',
        realms: {
            realmInvite: realm.realmCode
        },
        conLog: util.log
    })
    realmClients.set(realm.realmCode, client)

    client.on('join', () => {
        util.log(`Joined ${realm.realmName} as ${client.username}`)
    })

    client.on('player_list', (packet) => {
        const config = getConfig()

        packet.records.records.forEach((player) => {
            if (packet.records.type == 'add') {
                const username = player.username
                if (username == client.username) return
                const xuid = player.xbox_user_id
                const os = devices[player.build_platform]
                const joinedOn = Date.now()
                let kicked = false
                let kickedReason = ''

                if (!config.whitelist.includes(username) && config.bannedDevices.includes(os) && realm.modules.deviceFilter) {
                    kicked = true
                    sendCmd(client, `/kick "${username}" You joined on a banned device!\n§6Device: §c${os}\n§7Kicked by §3UniqueShield-OpenSource`)
                    kickedReason = `Joined on a banned device (${os})`
                }

                if (!kicked) {
                    util.sendEmbed('Player Joined', `${username} Joined the realm on ${os}!\n> XUID > \`${xuid}\``, 'Green', realm.logChannels.joinsAndLeaves)
                    util.log(`Player Joined ${realm.realmName} on ${os} >>  ${username}, ${xuid}`)
                }
                players.set(player.uuid, { ...player, joinedOn, kicked, kickedReason })

            } else {
                const { username, joinedOn, kicked, kickedReason } = players.get(player.uuid)
                if (kicked) {
                    util.sendEmbed('Player Kicked', `${username} was Kicked!\n> Reason > \`${kickedReason}\``, 'DarkRed', realm.logChannels.kicks)

                } else {
                    util.log(`Player left ${realm.realmName} >>  ${username}, Play time:` + `  ${((Date.now() - joinedOn) / 60000).toFixed(2)} Minutes`.cyan)
                    util.sendEmbed('Player Left', `${username} Left the realm\n> Play time: > \`${((Date.now() - joinedOn) / 60000).toFixed(2)} Minutes\``, 'Red', realm.logChannels.joinsAndLeaves)
                }
            }
        })
    })
    client.on('text', (packet) => {
        if (packet.needs_translation == false && packet.type == 'chat') {
            util.sendEmbed(false, `**${packet.source_name}**: ${packet.message}`, 'Grey', realm.logChannels.chat)
            util.log(`Relayed message from ${realm.realmName} to discord >>  ${packet.source_name}: ${packet.message}`)
        }
    })

    client.on('spawn', () => {
        util.log(`Bot spawned on ${realm.realmName}`)
        util.sendEmbed(`Bot connected`, `Successfuly connected to ${realm.realmName}`, 'Blue', realm.logChannels.chat)
    })

    client.on('error', (e) => {
        util.log(`Bot Got an error on ${realm.realmName} >>  ${e}, Reconnecting`)
    })
    client.on('kick', (e) => {
        util.log(`Bot Got kicked on ${realm.realmName} >>  ${e}, Reconnecting`)
        
    })
}

function relayMessage(message) {
    const realm = config.realms.find((i) => i.logChannels.chat == message.channelId)

    if (!realmClients.has(realm.realmCode)) return

    const client = realmClients.get(realm.realmCode)
    sendCmd(client, `/tellraw @a {"rawtext":[{"text":"[§9Discord§f] §7${message.author.displayName}§f: ${message.content}"}]}`)
    util.log(`Relayed message from ${message.channel.name} to ${realm.realmName} >>  ${message.author.displayName}: ${message.content}`)

}

function relayCommand(message) {
    const realm = config.realms.find((i) => i.logChannels.chat == message.channelId)

    if (!realmClients.has(realm.realmCode)) return

    const client = realmClients.get(realm.realmCode)
    const command = message.content.replace(';', '/')
    sendCmd(client, command)
    util.log(`Relayed Command from ${message.channel.name} to ${realm.realmName} >>  ${message.author.displayName}: ${command}`)

}

module.exports = { relayCommand, relayMessage, spawnBot }