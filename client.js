const { Client } = require('discord.js-selfbot-v13');
const { RETRY_LIMIT, TIMEOUT } = require('./config');
const { COMMAND_FIELDS, COMMAND_TYPES, OPTION_FIELDS, } = require('./fields-config');

const { CHANNEL_ID, TARGET_ID, TOKEN } = process.env;

const client = new Client({ checkUpdate: false });

const pickArr = (obj, paths) => obj.map(e => pick(e, paths));
const pick = (obj, paths) => paths
    ? paths.reduce((res, key) => ({ ...res, [key]: obj[key] }), {})
    : obj;

const getChannel = async ({ channelId, targetId }) => {
    const getChannelIdFromTarget = async (targetId) => {
        const target = await client.users.fetch(targetId);
        const message = await target.send('hi');
        return message.channelId;
    }
    return client.channels.fetch(channelId || await getChannelIdFromTarget(targetId || TARGET_ID) || CHANNEL_ID)
}

const getCommands = async ({ channelId, targetId, commandFields, optionFields }) => {
    const channel = await getChannel({ channelId, targetId });
    return getChannelCommands({ channel, commandFields, optionFields });
}

const getChannelCommands = async ({ channel, commandFields = COMMAND_FIELDS, optionFields = OPTION_FIELDS }) => {
    let commands = await channel.recipient.application.commands.fetch();
    commands = commands.filter(({ type }) => COMMAND_TYPES.includes(type))
    commands = pickArr(commands, commandFields).map(({ options, ...cmd }) => (
        { options: pickArr(options, optionFields), ...cmd })
    );
    return commands;
}

const getSlashReply = async ({ channelId, targetId, max, messageUpdate, commandName, options }) => {
    const channel = await getChannel({ channelId, targetId });
    const slash = await sendSlash({ channel, commandName, options });
    return getReply({ channel, slash, max, messageUpdate });
}

const sendSlash = async ({ channel, commandName, options = {} }) => {
    const commands = await getChannelCommands({ channel });
    const command = commands.filter(cmd => cmd.name === commandName)[0];
    const { options: commandOptions } = command
    const optionsArr = commandOptions.map(({ name }) => options[name]);
    return channel.sendSlash(channel.recipient.id, commandName, optionsArr);
}


const getReply = async ({ channel, slash: { nonce }, max = 1, messageUpdate }) => {
    const filter = msg =>
        msg.nonce === nonce && (msg.content || msg.embeds.length || msg.reactions);

    if (messageUpdate) {
        const replyListenerCallback = resolve => reply => {
            if (filter(reply)) resolve(reply);
        }

        const replyListener = event => {
            let callback;
            const listener = new Promise(resolve => {
                callback = replyListenerCallback(resolve);
                client.on(event, callback);
            })
            return { callback, listener };
        };

        const messageUpdateListener = replyListener('messageUpdate');

        const res = await Promise.race([
            messageUpdateListener.listener,
            new Promise(resolve => setTimeout(resolve, TIMEOUT))
        ]);

        client.removeListener('messageUpdate', messageUpdateListener.callback);
        return res;
    } else {
        return new Promise(resolve => {
            channel.awaitMessages({ filter, max, time: TIMEOUT, errors: ['time'] })
                .then(collected => {
                    resolve(collected);
                })
                .catch(collected => {
                    resolve(collected);
                });
        });
    }
}

client.once('ready', () => {
    console.log('Logged in as:', client.user.username);
});

client.login(TOKEN);

module.exports = { getCommands, getSlashReply };