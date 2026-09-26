/**
 * Deploy bot kwa user.
 *
 * GitHub URL na GitHub branch
 * vinatoka kwenye Bot config iliyowekwa na ADMIN.
 *
 * Customer hahitaji kuingiza GitHub URL.
 *
 * @returns {Object}
 */
async function deployBot(user, botId) {

  // =====================================================
  // 1. PATA BOT
  // =====================================================

  const bot = await Bot.findById(botId);

  if (!bot) {
    const err = new Error('Bot haipo.');
    err.status = 404;
    throw err;
  }

  if (bot.status !== 'active') {
    const err = new Error(
      'Bot haipatikani kwa sasa.'
    );

    err.status = 400;
    throw err;
  }

  // =====================================================
  // 2. VALIDATE BOT CONFIG
  // =====================================================

  const missingBotConfig = [];

  if (!bot.githubUrl) {
    missingBotConfig.push('githubUrl');
  }

  if (!bot.eggId) {
    missingBotConfig.push('eggId');
  }

  if (!bot.nestId) {
    missingBotConfig.push('nestId');
  }

  if (!bot.dockerImage) {
    missingBotConfig.push('dockerImage');
  }

  if (!bot.startupCommand) {
    missingBotConfig.push('startupCommand');
  }

  if (
    missingBotConfig.length > 0
  ) {
    const err = new Error(
      `MISSING kwenye bot config: ${missingBotConfig.join(', ')}`
    );

    err.status = 400;
    throw err;
  }

  // =====================================================
  // 3. CHECK COINS
  // =====================================================

  if (user.coins < bot.price) {

    const err = new Error(
      `Coins hazitoshi. Unazo ${user.coins}, unahitaji ${bot.price}.`
    );

    err.status = 400;

    throw err;
  }

  // =====================================================
  // 4. CREATE DEPLOYMENT RECORD
  // =====================================================

  const deployment =
    await Deployment.create({

      user: user._id,

      bot: bot._id,

      botName: bot.name,

      botImage: bot.image,

      /*
       * Hizi zinatoka kwenye Bot
       * iliyowekwa/configured na ADMIN.
       */
      githubUrl: bot.githubUrl,

      githubBranch:
        bot.githubBranch || 'main',

      ram: bot.ram,

      cpu: bot.cpu,

      disk: bot.disk,

      coinsSpent: bot.price,

      status: 'pending',

      progress: 5,
    });

  deployment.addLog(
    'Deployment imeanzishwa.',
    'info'
  );

  await deployment.save();

  let coinsDeducted = false;

  let pterodactylServerCreated = null;

  try {

    // ===================================================
    // 5. VERIFY GITHUB
    // ===================================================

    try {

      deployment.progress = 15;

      deployment.addLog(
        'Inahakiki GitHub repository...',
        'info'
      );

      await deployment.save();

      const githubCheck =
        await githubService.validateForDeployment(
          bot.githubUrl,
          bot.githubBranch || 'main'
        );

      if (!githubCheck.valid) {

        throw new Error(
          `GitHub: ${githubCheck.reason}`
        );
      }

      deployment.addLog(
        'GitHub repository imehakikiwa.',
        'success'
      );

      await deployment.save();

    } catch (ghErr) {

      /*
       * GitHub API ikifail kwa sababu ya
       * rate limit/network, deployment
       * inaweza kuendelea.
       *
       * Egg/startup ndiyo itajaribu clone.
       */
      deployment.addLog(
        `GitHub check: ${ghErr.message} (tunaendelea)`,
        'warn'
      );

      await deployment.save();
    }

    // ===================================================
    // 6. DEDUCT COINS
    // ===================================================

    deployment.progress = 30;

    deployment.addLog(
      'Inatoa coins...',
      'info'
    );

    await deployment.save();

    const {
      transaction
    } = await deductCoinsAndRecord({

      user,

      amount: bot.price,

      reason: 'bot-deployment',

      description:
        `Deployment ya bot: ${bot.name}`,

      referenceModel:
        'Deployment',

      referenceId:
        deployment._id,
    });

    coinsDeducted = true;

    deployment.addLog(
      `Coins zimetolewa: ${bot.price}. Transaction ID: ${transaction._id}`,
      'info'
    );

    await deployment.save();

    // ===================================================
    // 7. ENSURE PTERODACTYL USER
    // ===================================================

    deployment.progress = 45;

    deployment.addLog(
      'Inahakikisha Pterodactyl user...',
      'info'
    );

    await deployment.save();

    const pteroUser =
      await ensurePterodactylUser(user);

    deployment.addLog(
      `Pterodactyl user: ID=${pteroUser.id}, username=${pteroUser.username}`,
      'success'
    );

    await deployment.save();

    // ===================================================
    // 8. GET NODE
    // ===================================================

    deployment.progress = 55;

    deployment.addLog(
      'Inatafuta Pterodactyl node...',
      'info'
    );

    await deployment.save();

    const nodes =
      await pterodactylService.getNodes();

    if (
      !nodes ||
      nodes.length === 0
    ) {

      throw new Error(
        'Hakuna Pterodactyl node iliyopatikana.'
      );
    }

    /*
     * Kwa sasa tunatumia node ya kwanza.
     *
     * Baadaye admin anaweza kuwa na nodeId
     * ndani ya Bot model.
     */
    const nodeId =
      nodes[0].id;

    deployment.addLog(
      `Node imechaguliwa: ${nodeId}`,
      'info'
    );

    await deployment.save();

    // ===================================================
    // 9. GET FREE ALLOCATION
    // ===================================================

    deployment.progress = 60;

    deployment.addLog(
      'Inatafuta allocation inayopatikana...',
      'info'
    );

    await deployment.save();

    const allocations =
      await pterodactylService
        .getAllocationsByNode(
          nodeId
        );

    const freeAllocation =
      allocations.find(
        (allocation) =>
          !allocation.assigned
      );

    const allocationId =
      freeAllocation
        ? freeAllocation.id
        : null;

    if (!allocationId) {

      throw new Error(
        'Hakuna allocation inayopatikana kwenye node.'
      );
    }

    deployment.addLog(
      `Allocation imepatikana: ${allocationId}`,
      'success'
    );

    await deployment.save();

    // ===================================================
    // 10. CREATE SERVER
    // ===================================================

    deployment.progress = 65;

    deployment.addLog(
      'Inaunda server kwenye Pterodactyl...',
      'info'
    );

    await deployment.save();

    const serverName =
      `${bot.name}-${user.username}-${Date.now()
        .toString()
        .slice(-4)}`;

    /*
     * HAPA NDIPO TUMEONGEZA:
     *
     * githubUrl
     * githubBranch
     *
     * Hizi zinatoka kwa ADMIN kupitia Bot.
     */

    pterodactylServerCreated =
      await pterodactylService.createServer({

        name: serverName,

        userId: pteroUser.id,

        description:
          `DVARY HOSTING — ${bot.name}`,

        ram: bot.ram,

        cpu: bot.cpu,

        disk: bot.disk,

        nodeId,

        nestId: bot.nestId,

        eggId: bot.eggId,

        dockerImage:
          bot.dockerImage,

        startupCommand:
          bot.startupCommand,

        environmentVariables:
          bot.environmentVariables || {},

        allocationId,

        // =============================================
        // GITHUB - ADMIN CONFIG
        // =============================================

        githubUrl:
          bot.githubUrl,

        githubBranch:
          bot.githubBranch || 'main',
      });

    deployment.addLog(
      `Pterodactyl server imeundwa: ID=${pterodactylServerCreated.id}, identifier=${pterodactylServerCreated.identifier}`,
      'success'
    );

    await deployment.save();

    // ===================================================
    // 11. SAVE SERVER TO MONGODB
    // ===================================================

    deployment.progress = 85;

    deployment.addLog(
      'Inahifadhi server kwenye database...',
      'info'
    );

    await deployment.save();

    const serverDoc =
      await Server.create({

        user:
          user._id,

        source:
          'bot',

        bot:
          bot._id,

        name:
          bot.name,

        description:
          `Bot deployment: ${bot.name}`,

        ram:
          bot.ram,

        cpu:
          bot.cpu,

        disk:
          bot.disk,

        pterodactylServerId:
          pterodactylServerCreated.id,

        pterodactylServerIdentifier:
          pterodactylServerCreated.identifier,

        pterodactylServerUuid:
          pterodactylServerCreated.uuid,

        nodeId,

        nestId:
          bot.nestId,

        eggId:
          bot.eggId,

        allocationId,

        dockerImage:
          bot.dockerImage,

        startupCommand:
          bot.startupCommand,

        environmentVariables:
          bot.environmentVariables || {},

        coinsSpent:
          bot.price,

        status:
          'active',
      });

    // ===================================================
    // 12. MARK DEPLOYMENT SUCCESS
    // ===================================================

    deployment.markSuccess({

      pterodactylServerId:
        pterodactylServerCreated.id,

      pterodactylServerIdentifier:
        pterodactylServerCreated.identifier,

      pterodactylServerUuid:
        pterodactylServerCreated.uuid,
    });

    deployment.addLog(
      'Deployment imekamilika kwa mafanikio.',
      'success'
    );

    await deployment.save();

    // ===================================================
    // 13. INCREMENT DEPLOYMENTS
    // ===================================================

    try {

      await bot.incrementDeployments();

    } catch (e) {

      logger.warn(
        `incrementDeployments warn: ${e.message}`
      );
    }

    logger.info(
      `Bot deployment imefanikiwa: user=${user._id}, bot=${bot._id}, server=${serverDoc._id}`
    );

    // ===================================================
    // 14. RETURN
    // ===================================================

    return {

      success: true,

      deployment,

      server:
        serverDoc,

      message:
        `Deployment ya "${bot.name}" imefanikiwa.`,
    };

  } catch (err) {

    // ===================================================
    // ROLLBACK
    // ===================================================

    logger.error(
      `deployBot error: ${err.message}`
    );

    // ===================================================
    // REFUND COINS
    // ===================================================

    if (coinsDeducted) {

      try {

        await refundCoins({

          user,

          amount:
            bot.price,

          reason:
            'refund',

          description:
            `Refund kwa sababu deployment imefail: ${err.message}`,

          referenceModel:
            'Deployment',

          referenceId:
            deployment._id,
        });

        deployment.addLog(
          `Coins zimerudishwa (refund): ${bot.price}`,
          'warn'
        );

      } catch (refundErr) {

        logger.error(
          `Refund imefail kwa deployment ${deployment._id}: ${refundErr.message}`
        );
      }
    }

    // ===================================================
    // DELETE PTERODACTYL SERVER
    // ===================================================

    if (
      pterodactylServerCreated &&
      pterodactylServerCreated.id
    ) {

      try {

        await pterodactylService.deleteServer(
          pterodactylServerCreated.id
        );

        deployment.addLog(
          'Pterodactyl server ilifutwa (rollback).',
          'warn'
        );

      } catch (delErr) {

        logger.error(
          `deleteServer rollback warn: ${delErr.message}`
        );
      }
    }

    // ===================================================
    // MARK FAILED
    // ===================================================

    deployment.markFailed(
      err.message
    );

    deployment.addLog(
      `Imefail: ${err.message}`,
      'error'
    );

    await deployment.save();

    const wrapped =
      new Error(
        err.message ||
        'Deployment imefail.'
      );

    wrapped.status =
      err.status || 500;

    wrapped.deployment =
      deployment;

    throw wrapped;
  }
        }
